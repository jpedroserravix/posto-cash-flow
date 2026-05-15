import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { openInNewTab } from '@/lib/utils';

// ─── types ──────────────────────────────────────────────────────────────────

interface Props {
  funcionarioId: string;
  postoId: string;
}

interface EPIItem {
  id: string;
  tipo_item: string;
  quantidade: number;
}

interface EntregaEPI {
  id: string;
  data_entrega: string;
  comprovante_path: string | null;
  comprovante_type: string | null;
  observacoes: string | null;
  created_at: string;
  pessoal_entregas_epi_itens: EPIItem[];
}

interface Baixa {
  id: string;
  entrega_item_id: string;
  funcionario_id: string;
  quantidade: number;
  motivo: string;
  motivo_custom: string | null;
  observacao: string | null;
  data_baixa: string;
  created_at: string;
}

type Evento =
  | { kind: 'entrega'; date: string; tipoItem: string; quantidade: number }
  | { kind: 'baixa'; date: string; tipoItem: string; quantidade: number; motivo: string; motivoCustom: string | null };

// ─── constants ────────────────────────────────────────────────────────────────

const MOTIVOS = ['Erro de entrega', 'Perda', 'Devolução', 'Estragou', 'Outro'] as const;

const EMPTY_FORM = {
  motivo: '',
  motivoCustom: '',
  quantidade: '1',
  observacao: '',
  dataBaixa: new Date().toISOString().slice(0, 10),
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(str: string) {
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function motivoDisplay(motivo: string, motivoCustom: string | null) {
  return motivo === 'Outro' && motivoCustom ? motivoCustom : motivo;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function FuncionarioEPI({ funcionarioId }: Props) {
  const [entregas, setEntregas] = useState<EntregaEPI[]>([]);
  const [baixas, setBaixas] = useState<Baixa[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal
  const [baixaTarget, setBaixaTarget] = useState<{ itemId: string; tipoItem: string; maxQtd: number } | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: entData, error: entErr }, { data: bxData, error: bxErr }] = await Promise.all([
      (supabase as any)
        .from('pessoal_entregas_epi')
        .select('*, pessoal_entregas_epi_itens(id, tipo_item, quantidade)')
        .eq('funcionario_id', funcionarioId)
        .order('data_entrega', { ascending: false }),
      (supabase as any)
        .from('pessoal_baixas_epi')
        .select('*')
        .eq('funcionario_id', funcionarioId),
    ]);
    if (entErr) toast.error('Erro ao carregar entregas de EPI');
    else setEntregas(entData ?? []);
    if (bxErr) toast.error('Erro ao carregar baixas de EPI');
    else setBaixas(bxData ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [funcionarioId]);

  // itemId → { tipoItem, quantidadeEntregue }
  const itemMap = useMemo(() => {
    const map: Record<string, { tipoItem: string }> = {};
    for (const e of entregas) {
      for (const item of (e.pessoal_entregas_epi_itens ?? [])) {
        map[item.id] = { tipoItem: item.tipo_item };
      }
    }
    return map;
  }, [entregas]);

  // total baixado per itemId
  const baixadoByItem = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of baixas) {
      map[b.entrega_item_id] = (map[b.entrega_item_id] ?? 0) + b.quantidade;
    }
    return map;
  }, [baixas]);

  // summary per tipo_item: { entregue, baixado }
  const summary = useMemo(() => {
    const totals: Record<string, { entregue: number; baixado: number }> = {};
    for (const e of entregas) {
      for (const item of (e.pessoal_entregas_epi_itens ?? [])) {
        if (!totals[item.tipo_item]) totals[item.tipo_item] = { entregue: 0, baixado: 0 };
        totals[item.tipo_item].entregue += item.quantidade;
        totals[item.tipo_item].baixado += baixadoByItem[item.id] ?? 0;
      }
    }
    return Object.entries(totals).sort((a, b) => a[0].localeCompare(b[0]));
  }, [entregas, baixadoByItem]);

  // unified timeline for history section
  const history = useMemo((): Evento[] => {
    const events: Evento[] = [];
    for (const e of entregas) {
      for (const item of (e.pessoal_entregas_epi_itens ?? [])) {
        events.push({ kind: 'entrega', date: e.data_entrega, tipoItem: item.tipo_item, quantidade: item.quantidade });
      }
    }
    for (const b of baixas) {
      const info = itemMap[b.entrega_item_id];
      if (!info) continue;
      events.push({ kind: 'baixa', date: b.data_baixa, tipoItem: info.tipoItem, quantidade: b.quantidade, motivo: b.motivo, motivoCustom: b.motivo_custom });
    }
    events.sort((a, b) => b.date.localeCompare(a.date));
    return events;
  }, [entregas, baixas, itemMap]);

  function openModal(item: EPIItem) {
    const restante = item.quantidade - (baixadoByItem[item.id] ?? 0);
    setBaixaTarget({ itemId: item.id, tipoItem: item.tipo_item, maxQtd: restante });
    setForm({ ...EMPTY_FORM });
  }

  async function handleSave() {
    if (!baixaTarget) return;
    if (!form.motivo) { toast.error('Selecione o motivo'); return; }
    if (form.motivo === 'Outro' && !form.motivoCustom.trim()) { toast.error('Descreva o motivo'); return; }
    const qtd = parseInt(form.quantidade, 10);
    if (!qtd || qtd < 1) { toast.error('Informe a quantidade'); return; }
    if (qtd > baixaTarget.maxQtd) { toast.error(`Máximo disponível: ${baixaTarget.maxQtd}`); return; }

    setSaving(true);
    const { error } = await (supabase as any).from('pessoal_baixas_epi').insert({
      entrega_item_id: baixaTarget.itemId,
      funcionario_id: funcionarioId,
      quantidade: qtd,
      motivo: form.motivo,
      motivo_custom: form.motivo === 'Outro' ? form.motivoCustom.trim() : null,
      observacao: form.observacao.trim() || null,
      data_baixa: form.dataBaixa,
    });
    setSaving(false);

    if (error) { toast.error('Erro ao registrar baixa'); return; }
    toast.success('Baixa registrada');
    setBaixaTarget(null);
    load();
  }

  function getFileUrl(path: string) {
    const { data } = supabase.storage.from('pessoal-documentos').getPublicUrl(path);
    openInNewTab(data.publicUrl);
  }

  if (loading) {
    return <div className="text-xs text-muted-foreground py-4 text-center">Carregando...</div>;
  }

  return (
    <div className="space-y-4">

      {/* ── Resumo por tipo ─────────────────────────────────────────────────── */}
      {summary.length > 0 && (
        <div className="bg-muted/40 rounded-lg p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Saldo atual</div>
          <div className="space-y-1">
            {summary.map(([tipo, { entregue, baixado }]) => {
              const saldo = entregue - baixado;
              return (
                <div key={tipo} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  <span className="font-medium w-28 truncate">{tipo}</span>
                  <span className="text-green-700">+{entregue} entregue{entregue !== 1 ? 's' : ''}</span>
                  {baixado > 0 && <span className="text-red-600">−{baixado} baixado{baixado !== 1 ? 's' : ''}</span>}
                  <span className={`font-semibold ${saldo > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    = {saldo} em mãos
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Lista de entregas com botão Baixar ──────────────────────────────── */}
      {entregas.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Nenhuma entrega registrada.</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entregas</div>
          {entregas.map((e) => (
            <div key={e.id} className="border rounded-lg p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{formatDate(e.data_entrega)}</span>
                {e.comprovante_path && (
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => getFileUrl(e.comprovante_path!)}
                    title="Ver comprovante"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              <div className="space-y-1.5">
                {(e.pessoal_entregas_epi_itens ?? []).map((item) => {
                  const baixado = baixadoByItem[item.id] ?? 0;
                  const restante = item.quantidade - baixado;
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        <span className="font-medium text-foreground">{item.quantidade}×</span> {item.tipo_item}
                        {baixado > 0 && (
                          <span className="text-muted-foreground ml-1">({restante} em mãos)</span>
                        )}
                      </span>
                      {restante > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs px-2 text-destructive border-destructive/30 hover:bg-destructive/5 shrink-0"
                          onClick={() => openModal(item)}
                        >
                          Baixar
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic shrink-0">Baixado</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {e.observacoes && (
                <div className="text-muted-foreground italic">{e.observacoes}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Histórico de movimentações ───────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Histórico de movimentações</div>
          <div className="space-y-0.5">
            {history.map((ev, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded ${
                  ev.kind === 'entrega' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}
              >
                <span className="font-bold w-4 shrink-0">{ev.kind === 'entrega' ? '+' : '−'}</span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium">{ev.quantidade} {ev.tipoItem}</span>
                  {ev.kind === 'baixa' && (
                    <span className="opacity-80 ml-1">— {motivoDisplay(ev.motivo, ev.motivoCustom)}</span>
                  )}
                </span>
                <span className="opacity-60 shrink-0">{formatDate(ev.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal de baixa ──────────────────────────────────────────────────── */}
      <Dialog open={!!baixaTarget} onOpenChange={(o) => !o && setBaixaTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Baixar — {baixaTarget?.tipoItem}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo *</Label>
              <Select
                value={form.motivo}
                onValueChange={(v) => setForm((f) => ({ ...f, motivo: v, motivoCustom: '' }))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecionar motivo" />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.motivo === 'Outro' && (
              <div className="space-y-1.5">
                <Label className="text-xs">Descreva o motivo *</Label>
                <Input
                  className="h-9 text-sm"
                  value={form.motivoCustom}
                  onChange={(e) => setForm((f) => ({ ...f, motivoCustom: e.target.value }))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantidade *</Label>
                <Input
                  type="number"
                  min={1}
                  max={baixaTarget?.maxQtd}
                  className="h-9 text-sm"
                  value={form.quantidade}
                  onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))}
                />
                {baixaTarget && (
                  <p className="text-xs text-muted-foreground">Máx: {baixaTarget.maxQtd}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data da baixa</Label>
                <Input
                  type="date"
                  className="h-9 text-sm"
                  value={form.dataBaixa}
                  onChange={(e) => setForm((f) => ({ ...f, dataBaixa: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Observação</Label>
              <Textarea
                className="text-sm min-h-[60px] resize-none"
                value={form.observacao}
                onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBaixaTarget(null)}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Registrando...' : 'Registrar baixa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
