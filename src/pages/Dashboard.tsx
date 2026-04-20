import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Trash2, AlertTriangle, Clock, FileWarning, GraduationCap, X } from 'lucide-react';
import frases from '@/data/frasesSantos.json';

// ─── types ───────────────────────────────────────────────────────────────────

interface Recado {
  id: string;
  posto_id: string;
  criado_por: string;
  criado_por_nome: string;
  texto: string;
  urgente: boolean;
  expira_em: string | null;
  created_at: string;
}

interface AlertaItem {
  id: string;
  tipo: 'alvara' | 'treinamento' | 'contrato';
  nome: string;
  detalhe: string;
  postoNome: string;
  dias: number;
  dataVencimento: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
}

function timeAgo(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'agora mesmo';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `há ${days}d`;
  return new Date(isoStr).toLocaleDateString('pt-BR');
}

function daysUntil(dateStr: string): number {
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
  const exp = new Date(dateStr + 'T00:00:00');
  return Math.ceil((exp.getTime() - today.getTime()) / 86_400_000);
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function calcExpiracao(opt: string): string | null {
  if (opt === 'never') return null;
  const d = new Date();
  if (opt === '24h') d.setHours(d.getHours() + 24);
  else if (opt === '48h') d.setHours(d.getHours() + 48);
  else if (opt === '7d') d.setDate(d.getDate() + 7);
  else if (opt === '1m') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

const EXPIRACAO_OPTIONS = [
  { value: '24h', label: '24 horas' },
  { value: '48h', label: '48 horas' },
  { value: '7d',  label: '7 dias' },
  { value: '1m',  label: '1 mês' },
  { value: 'never', label: 'Indeterminado' },
];

// ─── frase do dia ─────────────────────────────────────────────────────────────

const fraseDia = (frases as { dia: number; santo: string; frase: string }[])[
  (getDayOfYear() - 1) % frases.length
];

// ─── component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { allPostos, selectedPostoId, user, role, nome } = useAuth();

  const postoIds = useMemo(
    () => (allPostos.length > 0 ? allPostos.map((p) => p.id) : selectedPostoId ? [selectedPostoId] : []),
    [allPostos, selectedPostoId],
  );
  const targetPostoId = selectedPostoId ?? allPostos[0]?.id ?? null;

  // ── mural state ────────────────────────────────────────────────────────────
  const [recados, setRecados] = useState<Recado[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newTexto, setNewTexto] = useState('');
  const [newExpiracao, setNewExpiracao] = useState('7d');
  const [newUrgente, setNewUrgente] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── alertas state ──────────────────────────────────────────────────────────
  const [alertas, setAlertas] = useState<AlertaItem[]>([]);

  // ── load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (postoIds.length > 0) {
      loadRecados();
      loadAlertas();
    }
  }, [postoIds]);

  async function loadRecados() {
    const now = new Date().toISOString();
    const { data, error } = await (supabase as any)
      .from('mural_recados')
      .select('*')
      .in('posto_id', postoIds)
      .or(`expira_em.is.null,expira_em.gt.${now}`)
      .order('created_at', { ascending: false });
    if (!error) setRecados(data ?? []);
  }

  async function loadAlertas() {
    const today = new Date().toISOString().split('T')[0];
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    const past = pastDate.toISOString().split('T')[0];
    const future = new Date();
    future.setDate(future.getDate() + 90);
    const futureStr = future.toISOString().split('T')[0];

    const [{ data: alvaras }, { data: treinamentosRaw }, { data: contratos }] = await Promise.all([
      (supabase as any)
        .from('documentos_alvaras')
        .select('id, nome_documento, posto_id, data_vencimento')
        .in('posto_id', postoIds)
        .not('data_vencimento', 'is', null)
        .gte('data_vencimento', past)
        .lte('data_vencimento', futureStr),
      (supabase as any)
        .from('funcionario_treinamentos')
        .select('id, data_vencimento, funcionario_id, curso_id, pessoal_funcionarios(nome, posto_id), cursos(nome)')
        .not('data_vencimento', 'is', null)
        .gte('data_vencimento', past)
        .lte('data_vencimento', futureStr),
      (supabase as any)
        .from('pessoal_funcionarios')
        .select('id, nome, posto_id, prazo_experiencia, inicio_experiencia, renovavel, prazo_renovacao, experiencia_efetivado')
        .in('posto_id', postoIds)
        .eq('em_experiencia', true)
        .eq('status', 'ativo')
        .not('inicio_experiencia', 'is', null)
        .not('prazo_experiencia', 'is', null),
    ]);

    const items: AlertaItem[] = [];

    (alvaras ?? []).forEach((a: any) => {
      const postoNome = allPostos.find((p) => p.id === a.posto_id)?.nome ?? '';
      items.push({
        id: a.id,
        tipo: 'alvara',
        nome: a.nome_documento,
        detalhe: '',
        postoNome,
        dias: daysUntil(a.data_vencimento),
        dataVencimento: a.data_vencimento,
      });
    });

    (treinamentosRaw ?? []).forEach((t: any) => {
      const func = t.pessoal_funcionarios;
      const curso = t.cursos;
      if (!func || !func.posto_id) return;
      if (!postoIds.includes(func.posto_id)) return;
      const postoNome = allPostos.find((p) => p.id === func.posto_id)?.nome ?? '';
      items.push({
        id: t.id,
        tipo: 'treinamento',
        nome: curso?.nome ?? 'Treinamento',
        detalhe: func.nome ?? '',
        postoNome,
        dias: daysUntil(t.data_vencimento),
        dataVencimento: t.data_vencimento,
      });
    });

    // ── contratos de experiência (janela: vencendo em ≤7 dias ou já vencidos) ──
    (contratos ?? []).forEach((c: any) => {
      if (c.experiencia_efetivado) return;
      const fim1 = addDaysToDate(c.inicio_experiencia, c.prazo_experiencia - 1);
      const fim2 = c.renovavel && c.prazo_renovacao ? addDaysToDate(fim1, c.prazo_renovacao) : null;
      const todayStr = new Date().toISOString().split('T')[0];
      let fimAtual: string;
      let periodoLabel: string;
      if (todayStr <= fim1) {
        fimAtual = fim1; periodoLabel = '1º período';
      } else if (fim2) {
        fimAtual = fim2; periodoLabel = '2º período';
      } else {
        fimAtual = fim1; periodoLabel = '1º período';
      }
      const dias = daysUntil(fimAtual);
      if (dias > 7) return; // só alertar nos próximos 7 dias ou vencidos
      const postoNome = allPostos.find((p) => p.id === c.posto_id)?.nome ?? '';
      items.push({
        id: c.id,
        tipo: 'contrato',
        nome: `Contrato de Experiência — ${periodoLabel}`,
        detalhe: c.nome,
        postoNome,
        dias,
        dataVencimento: fimAtual,
      });
    });

    items.sort((a, b) => a.dias - b.dias);
    setAlertas(items);
  }

  // ── handlers ───────────────────────────────────────────────────────────────

  async function handleCreateRecado() {
    if (!newTexto.trim() || !targetPostoId || !user) return;
    setSaving(true);
    const { error } = await (supabase as any).from('mural_recados').insert({
      posto_id: targetPostoId,
      criado_por: user.id,
      criado_por_nome: nome || user.email || 'Usuário',
      texto: newTexto.trim(),
      urgente: newUrgente,
      expira_em: calcExpiracao(newExpiracao),
    });
    setSaving(false);
    if (error) { toast.error('Erro ao publicar recado'); return; }
    toast.success('Recado publicado');
    setNewTexto('');
    setNewUrgente(false);
    setNewExpiracao('7d');
    setShowForm(false);
    loadRecados();
  }

  async function handleDeleteRecado(id: string) {
    const { error } = await (supabase as any).from('mural_recados').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir recado'); return; }
    toast.success('Recado removido');
    loadRecados();
  }

  // ── render ─────────────────────────────────────────────────────────────────

  if (postoIds.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Nenhum posto disponível.</p>;
  }

  return (
    <div className="space-y-6">

      {/* ── SEÇÃO 1: FRASE DO DIA ─────────────────────────────────────────── */}
      {fraseDia && (
        <div className="rounded-xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/70 dark:border-amber-700/30 px-5 py-4">
          <div className="flex items-start gap-2">
            <span className="text-4xl leading-none text-amber-400/70 font-serif select-none mt-0.5">&ldquo;</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm sm:text-base italic text-amber-900/80 dark:text-amber-100/80 leading-relaxed">
                {fraseDia.frase}
              </p>
              <p className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 tracking-wide">
                — {fraseDia.santo}
              </p>
            </div>
            <span className="text-4xl leading-none text-amber-400/70 font-serif select-none self-end">&rdquo;</span>
          </div>
        </div>
      )}

      {/* ── SEÇÃO 2: MURAL DE RECADOS ─────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Mural de Recados</h2>
          {!showForm && (
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowForm(true)}>
              <Plus className="w-3.5 h-3.5" />Novo Recado
            </Button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <Card className="border-primary/40">
            <CardContent className="pt-4 space-y-3">
              <Textarea
                autoFocus
                value={newTexto}
                onChange={(e) => setNewTexto(e.target.value)}
                placeholder="Escreva o recado aqui..."
                className="min-h-[80px] text-sm resize-none"
              />
              <div className="flex flex-wrap items-center gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Expira em</Label>
                  <Select value={newExpiracao} onValueChange={setNewExpiracao}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRACAO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <Switch
                    id="urgente"
                    checked={newUrgente}
                    onCheckedChange={setNewUrgente}
                  />
                  <Label htmlFor="urgente" className="text-xs cursor-pointer">Urgente</Label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => { setShowForm(false); setNewTexto(''); setNewUrgente(false); }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleCreateRecado}
                  disabled={saving || !newTexto.trim()}
                >
                  {saving ? 'Publicando...' : 'Publicar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recados list */}
        {recados.length === 0 && !showForm && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Nenhum recado no mural.</p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {recados.map((r) => {
            const canDelete = role === 'admin' || r.criado_por === user?.id;
            return (
              <Card
                key={r.id}
                className={r.urgente ? 'border-red-400 dark:border-red-600' : ''}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      {r.urgente && (
                        <div className="flex items-center gap-1 mb-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Urgente</span>
                        </div>
                      )}
                      <p className="text-sm leading-relaxed">{r.texto}</p>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                        <span className="font-medium">{r.criado_por_nome}</span>
                        <span>·</span>
                        <span>{timeAgo(r.created_at)}</span>
                        {allPostos.length > 1 && (
                          <>
                            <span>·</span>
                            <span>{allPostos.find((p) => p.id === r.posto_id)?.nome ?? ''}</span>
                          </>
                        )}
                        {r.expira_em && (
                          <>
                            <span>·</span>
                            <span className="text-muted-foreground/70">
                              expira {new Date(r.expira_em).toLocaleDateString('pt-BR')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteRecado(r.id)}
                        title="Excluir recado"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── SEÇÃO 3: ALERTAS DE DOCUMENTOS ───────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Alertas — Documentos e Treinamentos</h2>

        {alertas.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum documento ou treinamento vencendo nos próximos 90 dias.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {alertas.map((a) => {
              const isVencido = a.dias < 0;
              const isProximo = a.dias >= 0 && a.dias <= 30;

              return (
                <div
                  key={`${a.tipo}-${a.id}`}
                  className={`rounded-lg border px-3 py-2.5 flex items-start gap-2.5 ${
                    isVencido
                      ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/20'
                      : isProximo
                        ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/20'
                        : 'border-border bg-card'
                  }`}
                >
                  {/* Icon */}
                  <div className="shrink-0 mt-0.5">
                    {a.tipo === 'treinamento' ? (
                      <GraduationCap className={`w-4 h-4 ${isVencido ? 'text-red-500' : isProximo ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                    ) : a.tipo === 'contrato' ? (
                      <Clock className={`w-4 h-4 ${isVencido ? 'text-red-500' : isProximo ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                    ) : (
                      <FileWarning className={`w-4 h-4 ${isVencido ? 'text-red-500' : isProximo ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-tight truncate">{a.nome}</p>
                    {a.detalhe && (
                      <p className="text-[10px] text-muted-foreground truncate">{a.detalhe}</p>
                    )}
                    {allPostos.length > 1 && a.postoNome && (
                      <p className="text-[10px] text-muted-foreground truncate">{a.postoNome}</p>
                    )}
                  </div>

                  {/* Days badge */}
                  <div className="shrink-0 text-right">
                    <Badge
                      className={`text-[10px] whitespace-nowrap ${
                        isVencido
                          ? 'bg-red-500 hover:bg-red-500 text-white'
                          : isProximo
                            ? 'bg-yellow-500 hover:bg-yellow-500 text-white'
                            : 'bg-muted text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {isVencido
                        ? `${Math.abs(a.dias)}d atrás`
                        : a.dias === 0
                          ? 'Hoje'
                          : `${a.dias}d`}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(a.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
