import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, FileText, Calendar } from 'lucide-react';
import { openInNewTab } from '@/lib/utils';
import {
  computePeriodos, computeFeriasAlert, daysUntil, daysBetween, periodLabel,
  type Periodo, type FeriasRecord,
} from '@/lib/feriasPeriodos';

// ─── types ────────────────────────────────────────────────────────────────────

interface Ferias {
  id: string;
  funcionario_id: string;
  posto_id: string;
  periodo_aquisitivo_inicio: string;
  periodo_aquisitivo_fim: string;
  data_inicio: string;
  data_fim: string;
  dias_gozados: number;
  dias_vendidos: number;
  observacoes: string | null;
  arquivo_path: string | null;
  arquivo_type: string | null;
  alerta_meses: number;
  saldo_dias: number;
}

interface Props {
  funcionarioId: string;
  postoId: string;
  dataAdmissao: string;
}

const EMPTY_FORM = {
  periodo_inicio: '',
  data_inicio: '',
  data_fim: '',
  dias_gozados: '',
  dias_vendidos: '0',
  saldo_dias: '30',
  alerta_meses: '6',
  observacoes: '',
};

function formatDate(str: string | null): string {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function FuncionarioFerias({ funcionarioId, postoId, dataAdmissao }: Props) {
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Ferias | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Ferias | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const periodos = useMemo(() => computePeriodos(dataAdmissao), [dataAdmissao]);
  const completedPeriodos = periodos.filter((p) => p.completed);
  const inProgressPeriodo = periodos.find((p) => !p.completed) ?? null;

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('pessoal_ferias')
      .select('*')
      .eq('funcionario_id', funcionarioId)
      .order('data_inicio', { ascending: false });
    if (error) toast.error('Erro ao carregar férias');
    else setFerias(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [funcionarioId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── derived: stats per period ────────────────────────────────────────────

  const periodoStats = useMemo(() => {
    const map = new Map<string, { gozados: number; vendidos: number; alerta_meses: number; saldo_dias: number }>();
    ferias.forEach((f) => {
      const cur = map.get(f.periodo_aquisitivo_inicio) ?? { gozados: 0, vendidos: 0, alerta_meses: 6, saldo_dias: 30 };
      map.set(f.periodo_aquisitivo_inicio, {
        gozados: cur.gozados + (f.dias_gozados ?? 0),
        vendidos: cur.vendidos + (f.dias_vendidos ?? 0),
        alerta_meses: Math.max(cur.alerta_meses, f.alerta_meses ?? 6),
        // keep the first value seen (ferias loaded desc, so first = most recent)
        saldo_dias: cur.saldo_dias !== 30 ? cur.saldo_dias : (f.saldo_dias ?? 30),
      });
    });
    return map;
  }, [ferias]);

  // "Current relevant period": oldest completed period with saldo > 0, or most recent completed, or in-progress
  const relevantPeriodo: Periodo | null = useMemo(() => {
    for (const p of completedPeriodos) {
      const st = periodoStats.get(p.inicio);
      const direito = st?.saldo_dias ?? 30;
      const saldo = direito - (st?.gozados ?? 0) - (st?.vendidos ?? 0);
      if (saldo > 0) return p;
    }
    if (completedPeriodos.length > 0) return completedPeriodos[completedPeriodos.length - 1];
    return inProgressPeriodo;
  }, [completedPeriodos, inProgressPeriodo, periodoStats]);

  const summaryStats = relevantPeriodo
    ? (periodoStats.get(relevantPeriodo.inicio) ?? { gozados: 0, vendidos: 0, alerta_meses: 6, saldo_dias: 30 })
    : { gozados: 0, vendidos: 0, alerta_meses: 6, saldo_dias: 30 };

  const direito = summaryStats.saldo_dias ?? 30;
  const saldo = relevantPeriodo?.completed
    ? Math.max(0, direito - summaryStats.gozados - summaryStats.vendidos)
    : null;

  type StatusColor = 'verde' | 'amarelo' | 'vermelho' | 'neutro';
  const statusColor: StatusColor = useMemo(() => {
    if (!relevantPeriodo?.completed) return 'neutro';
    if (saldo === 0) return 'verde';
    const d = daysUntil(relevantPeriodo.vencimento);
    if (d < 0) return 'vermelho';
    if (d <= summaryStats.alerta_meses * 30) return 'amarelo';
    return 'verde';
  }, [relevantPeriodo, saldo, summaryStats.alerta_meses]);

  const STATUS_LABEL: Record<StatusColor, string> = {
    verde: 'Em dia',
    amarelo: 'Próximo de vencer',
    vermelho: 'Vencido',
    neutro: 'Em período aquisitivo',
  };

  const SC = {
    verde:    { border: 'border-l-green-500',  bg: 'bg-green-50',  dot: 'bg-green-500',  badge: 'bg-green-600 hover:bg-green-600' },
    amarelo:  { border: 'border-l-yellow-500', bg: 'bg-yellow-50', dot: 'bg-yellow-500', badge: 'bg-yellow-500 hover:bg-yellow-500' },
    vermelho: { border: 'border-l-red-500',    bg: 'bg-red-50',    dot: 'bg-red-500',    badge: 'bg-red-500 hover:bg-red-500' },
    neutro:   { border: 'border-l-gray-300',   bg: 'bg-muted/20',  dot: 'bg-gray-400',   badge: 'bg-gray-400 hover:bg-gray-400' },
  }[statusColor];

  // ─── dialog handlers ──────────────────────────────────────────────────────

  function openNew() {
    setEditTarget(null);
    const defaultPeriodo = relevantPeriodo ?? periodos[periodos.length - 1];
    setForm({
      ...EMPTY_FORM,
      periodo_inicio: defaultPeriodo?.inicio ?? '',
      alerta_meses: String(summaryStats.alerta_meses),
    });
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setDialogOpen(true);
  }

  function openEdit(f: Ferias) {
    setEditTarget(f);
    setForm({
      periodo_inicio: f.periodo_aquisitivo_inicio,
      data_inicio: f.data_inicio,
      data_fim: f.data_fim,
      dias_gozados: String(f.dias_gozados),
      dias_vendidos: String(f.dias_vendidos ?? 0),
      saldo_dias: String(f.saldo_dias ?? 30),
      alerta_meses: String(f.alerta_meses ?? 6),
      observacoes: f.observacoes ?? '',
    });
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setDialogOpen(true);
  }

  function handleDatasChange(field: 'data_inicio' | 'data_fim', value: string) {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      const a = field === 'data_inicio' ? value : f.data_inicio;
      const b = field === 'data_fim'   ? value : f.data_fim;
      if (a && b && b >= a) {
        updated.dias_gozados = String(daysBetween(a, b) + 1);
      }
      return updated;
    });
  }

  async function handleSave() {
    if (!form.periodo_inicio || !form.data_inicio || !form.data_fim) {
      toast.error('Preencha o período, data início e data fim');
      return;
    }
    const dias = parseInt(form.dias_gozados) || 0;
    if (dias <= 0) { toast.error('Informe os dias gozados'); return; }

    setSaving(true);

    const periodo = periodos.find((p) => p.inicio === form.periodo_inicio);
    let arquivo_path: string | null = editTarget?.arquivo_path ?? null;
    let arquivo_type: string | null = editTarget?.arquivo_type ?? null;

    if (file) {
      const ext = file.name.split('.').pop();
      const path = `ferias/${funcionarioId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('pessoal-documentos').upload(path, file);
      if (upErr) { toast.error('Erro ao enviar arquivo'); setSaving(false); return; }
      arquivo_path = path;
      arquivo_type = file.type;
    }

    const payload = {
      funcionario_id: funcionarioId,
      posto_id: postoId,
      periodo_aquisitivo_inicio: form.periodo_inicio,
      periodo_aquisitivo_fim: periodo?.fim ?? form.periodo_inicio,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      dias_gozados: dias,
      dias_vendidos: parseInt(form.dias_vendidos) || 0,
      saldo_dias: parseInt(form.saldo_dias) || 30,
      alerta_meses: parseInt(form.alerta_meses) || 6,
      observacoes: form.observacoes.trim() || null,
      arquivo_path,
      arquivo_type,
    };

    let error;
    if (editTarget) {
      ({ error } = await (supabase as any).from('pessoal_ferias').update(payload).eq('id', editTarget.id));
    } else {
      ({ error } = await (supabase as any).from('pessoal_ferias').insert(payload));
    }

    if (error) { toast.error('Erro ao salvar: ' + error.message); }
    else {
      toast.success(editTarget ? 'Férias atualizadas' : 'Férias registradas');
      setDialogOpen(false);
      await load();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.arquivo_path) {
      await supabase.storage.from('pessoal-documentos').remove([deleteTarget.arquivo_path]);
    }
    const { error } = await (supabase as any).from('pessoal_ferias').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Erro ao excluir'); }
    else { toast.success('Registro excluído'); setDeleteTarget(null); await load(); }
  }

  function getFileUrl(path: string) {
    const { data } = supabase.storage.from('pessoal-documentos').getPublicUrl(path);
    openInNewTab(data.publicUrl);
  }

  // ─── derived: ferias grouped by period key, descending ────────────────────

  const feriasGrouped = useMemo(() => {
    const map = new Map<string, Ferias[]>();
    ferias.forEach((f) => {
      const key = f.periodo_aquisitivo_inicio;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [ferias]);

  // All completed periods that should appear in history (with or without records)
  const historyPeriodos = completedPeriodos.slice().reverse(); // most recent first

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Summary card ── */}
      {relevantPeriodo && (
        <div className={`border-l-4 rounded-r-lg p-4 border ${SC.border} ${SC.bg}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${SC.dot}`} />
              <span className="text-sm font-semibold">Período Aquisitivo {relevantPeriodo.completed ? 'Atual' : 'em Andamento'}</span>
            </div>
            <Badge className={`${SC.badge} text-white text-xs`}>{STATUS_LABEL[statusColor]}</Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-muted-foreground mb-0.5">Período</div>
              <div className="font-medium">{relevantPeriodo.label}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Direito</div>
              <div className="font-medium">{direito} dias</div>
            </div>
            {relevantPeriodo.completed ? (
              <>
                <div>
                  <div className="text-muted-foreground mb-0.5">Gozados</div>
                  <div className="font-medium">{summaryStats.gozados} dias</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Vendidos (abono)</div>
                  <div className="font-medium">{summaryStats.vendidos} dias</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Saldo</div>
                  <div className={`font-bold text-sm ${saldo! > 0 ? (statusColor === 'vermelho' ? 'text-red-600' : statusColor === 'amarelo' ? 'text-yellow-700' : 'text-green-700') : 'text-muted-foreground'}`}>
                    {saldo} dias
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Fim do período aquisitivo</div>
                  <div className="font-medium">{formatDate(relevantPeriodo.fim)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Último prazo para concessão</div>
                  <div className={`font-medium text-xs ${statusColor === 'vermelho' ? 'text-red-600' : statusColor === 'amarelo' ? 'text-yellow-700' : ''}`}>
                    {formatDate(relevantPeriodo.vencimento)}
                    {(() => {
                      const d = daysUntil(relevantPeriodo.vencimento);
                      if (d < 0) return <span> (vencido há {Math.abs(d)}d)</span>;
                      if (d === 0) return <span> (hoje!)</span>;
                      return <span className="text-muted-foreground"> ({d}d)</span>;
                    })()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Alerta</div>
                  <div>{summaryStats.alerta_meses} meses antes do vencimento</div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-muted-foreground mb-0.5">Início</div>
                  <div className="font-medium">{formatDate(relevantPeriodo.inicio)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-0.5">Conclusão prevista</div>
                  <div className="font-medium">{formatDate(relevantPeriodo.fim)}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!relevantPeriodo && (
        <div className="border rounded-lg p-4 text-sm text-muted-foreground text-center">
          Data de admissão necessária para calcular os períodos aquisitivos.
        </div>
      )}

      {/* ── Action bar ── */}
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs gap-1" onClick={openNew} disabled={periodos.length === 0}>
          <Plus className="w-3.5 h-3.5" /> Registrar Férias
        </Button>
      </div>

      {/* ── History ── */}
      {loading && <div className="text-xs text-muted-foreground text-center py-6">Carregando...</div>}

      {!loading && historyPeriodos.length === 0 && (
        <div className="text-xs text-muted-foreground text-center py-6 border rounded">
          Nenhum período aquisitivo completado ainda.
        </div>
      )}

      <div className="space-y-3">
        {historyPeriodos.map((p) => {
          const records = (feriasGrouped.find(([k]) => k === p.inicio)?.[1] ?? [])
            .slice().sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
          const st = periodoStats.get(p.inicio) ?? { gozados: 0, vendidos: 0, alerta_meses: 6, saldo_dias: 30 };
          const saldoPeriodo = Math.max(0, (st.saldo_dias ?? 30) - st.gozados - st.vendidos);
          const daysLeft = daysUntil(p.vencimento);
          const isVencido = daysLeft < 0 && saldoPeriodo > 0;
          const isAlerta = daysLeft >= 0 && daysLeft <= st.alerta_meses * 30 && saldoPeriodo > 0;

          return (
            <div key={p.inicio} className={`border rounded-lg overflow-hidden ${isVencido ? 'border-red-300' : isAlerta ? 'border-yellow-300' : ''}`}>
              {/* Period header */}
              <div className={`px-3 py-2 flex items-center justify-between text-xs ${isVencido ? 'bg-red-50' : isAlerta ? 'bg-yellow-50' : 'bg-muted/30'}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  {p.label}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground flex-wrap justify-end">
                  <span>Gozados: {st.gozados}d</span>
                  {st.vendidos > 0 && <span>· Vendidos: {st.vendidos}d</span>}
                  <span>·</span>
                  <span>Saldo: <span className={saldoPeriodo > 0 ? (isVencido ? 'text-red-600 font-semibold' : isAlerta ? 'text-yellow-700 font-semibold' : 'text-orange-600 font-medium') : 'text-green-700 font-medium'}>{saldoPeriodo}d</span></span>
                  <span>·</span>
                  <span>Fim aq.: {formatDate(p.fim)}</span>
                  <span>·</span>
                  <span className={isVencido ? 'text-red-600 font-medium' : isAlerta ? 'text-yellow-700' : ''}>
                    Último prazo: {formatDate(p.vencimento)}
                    {daysLeft < 0 && saldoPeriodo > 0 && <span> (há {Math.abs(daysLeft)}d)</span>}
                    {daysLeft >= 0 && daysLeft <= st.alerta_meses * 30 && saldoPeriodo > 0 && <span> ({daysLeft}d)</span>}
                  </span>
                </div>
              </div>

              {/* Records */}
              {records.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground italic">Nenhum registro de férias para este período.</div>
              ) : (
                <div className="divide-y">
                  {records.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-muted/10">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">
                          {formatDate(f.data_inicio)} – {formatDate(f.data_fim)}
                        </div>
                        <div className="text-muted-foreground flex gap-x-3 flex-wrap mt-0.5">
                          <span>{f.dias_gozados} dias gozados</span>
                          {f.dias_vendidos > 0 && <span>· {f.dias_vendidos} dias vendidos (abono)</span>}
                          {f.observacoes && <span>· {f.observacoes}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {f.arquivo_path && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Ver recibo" onClick={() => getFileUrl(f.arquivo_path!)}>
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(f)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar Férias' : 'Registrar Férias'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Período Aquisitivo *</Label>
              <Select value={form.periodo_inicio} onValueChange={(v) => setForm((f) => ({ ...f, periodo_inicio: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar período" /></SelectTrigger>
                <SelectContent>
                  {periodos.filter((p) => p.started).slice().reverse().map((p) => (
                    <SelectItem key={p.inicio} value={p.inicio}>
                      {p.label}{!p.completed ? ' (em andamento)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.periodo_inicio && (() => {
                const p = periodos.find((x) => x.inicio === form.periodo_inicio);
                if (!p?.completed) return null;
                const st = periodoStats.get(form.periodo_inicio) ?? { gozados: 0, vendidos: 0, alerta_meses: 6, saldo_dias: 30 };
                const direitoPeriodo = parseInt(form.saldo_dias) || (st.saldo_dias ?? 30);
                const currentSaldo = direitoPeriodo - st.gozados - st.vendidos - (editTarget ? editTarget.dias_gozados + editTarget.dias_vendidos : 0);
                return (
                  <p className="text-[10px] text-muted-foreground">
                    Saldo disponível: {Math.max(0, currentSaldo)} dias · Fim aq.: {formatDate(p.fim)} · Último prazo: {formatDate(p.vencimento)}
                  </p>
                );
              })()}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data Início *</Label>
                <Input type="date" className="h-8 text-xs" value={form.data_inicio} onChange={(e) => handleDatasChange('data_inicio', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data Fim *</Label>
                <Input type="date" className="h-8 text-xs" value={form.data_fim} onChange={(e) => handleDatasChange('data_fim', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Dias Gozados</Label>
                <Input type="number" min="1" max="30" className="h-8 text-xs" value={form.dias_gozados}
                  onChange={(e) => setForm((f) => ({ ...f, dias_gozados: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground">Auto-calculado pelas datas</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Abono Pecuniário (dias vendidos)</Label>
                <Input type="number" min="0" max="10" className="h-8 text-xs" value={form.dias_vendidos}
                  onChange={(e) => setForm((f) => ({ ...f, dias_vendidos: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Saldo de dias (direito do período)</Label>
              <Input type="number" min="1" max="30" className="h-8 text-xs" value={form.saldo_dias}
                onChange={(e) => setForm((f) => ({ ...f, saldo_dias: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">Padrão: 30. Ajuste para férias proporcionais.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Alertar antes do vencimento</Label>
              <Select value={form.alerta_meses} onValueChange={(v) => setForm((f) => ({ ...f, alerta_meses: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 meses antes</SelectItem>
                  <SelectItem value="6">6 meses antes</SelectItem>
                  <SelectItem value="9">9 meses antes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea className="text-xs min-h-[50px]" value={form.observacoes}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Recibo de Férias (PDF/JPEG/PNG, opcional)</Label>
              <Input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-8 text-xs"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {editTarget?.arquivo_path && !file && (
                <p className="text-[10px] text-muted-foreground">Arquivo existente será mantido.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : (editTarget ? 'Salvar' : 'Registrar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro de férias?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
