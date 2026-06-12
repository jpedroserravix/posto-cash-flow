import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, AlertTriangle, Clock, FileWarning, GraduationCap, X, CalendarX2, CalendarClock, Inbox, Settings, Gauge, ListChecks } from 'lucide-react';
import { computeFeriasAlert, type FeriasRecord } from '@/lib/feriasPeriodos';
import frases from '@/data/frasesSantos.json';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  tipo: 'alvara' | 'treinamento' | 'contrato' | 'ferias' | 'entrevista';
  nome: string;
  detalhe: string;
  postoNome: string;
  dias: number;
  dataVencimento: string;
}

interface AfericaoInfo {
  postoId: string;
  postoNome: string;
  datas: string[];
}

interface CaixaMesPendencia {
  label: string;
  count: number;
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

function formatDateBR(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function daysUntil(dateStr: string): number {
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
  const exp = new Date(dateStr + 'T00:00:00');
  return Math.ceil((exp.getTime() - today.getTime()) / 86_400_000);
}

function daysSince(dateStr: string): number {
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00');
  const past = new Date(dateStr + 'T00:00:00');
  return Math.floor((today.getTime() - past.getTime()) / 86_400_000);
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '—';
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
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

// ─── alert prefs ─────────────────────────────────────────────────────────────

const ALERT_PREFS_DEFS = [
  { key: 'alvaras',      label: 'Documentos/Alvarás vencendo' },
  { key: 'treinamentos', label: 'Certificados/Cursos vencendo' },
  { key: 'ferias',       label: 'Férias vencendo' },
  { key: 'contratos',    label: 'Contratos de experiência vencendo' },
  { key: 'entrevistas',  label: 'Entrevistas agendadas' },
  { key: 'curriculos',   label: 'Currículos novos (Caixa de Entrada)' },
  { key: 'feedbacks',    label: 'Feedbacks novos (Caixa de Entrada)' },
  { key: 'afericoes',    label: 'Aferições por posto' },
  { key: 'caixas',       label: 'Caixas com pendência (turnos não conferidos)' },
];

const TIPO_TO_PREF: Record<AlertaItem['tipo'], string> = {
  alvara:      'alvaras',
  treinamento: 'treinamentos',
  ferias:      'ferias',
  contrato:    'contratos',
  entrevista:  'entrevistas',
};

// ─── frase do dia ─────────────────────────────────────────────────────────────

const fraseDia = (frases as { dia: number; santo: string; frase: string }[])[
  (getDayOfYear() - 1) % frases.length
];

// ─── component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { allPostos, selectedPostoId, user, role, nome, hasPermission } = useAuth();

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

  // ── alert prefs state ──────────────────────────────────────────────────────
  const [alertPrefs, setAlertPrefs]       = useState<Record<string, boolean>>({});
  const [showAlertConfig, setShowAlertConfig] = useState(false);
  const [localPrefs, setLocalPrefs]       = useState<Record<string, boolean>>({});
  const [savingPrefs, setSavingPrefs]     = useState(false);

  // ── aferições state ────────────────────────────────────────────────────────
  const [afericoesPorPosto, setAfericoesPorPosto] = useState<AfericaoInfo[]>([]);

  // ── caixas pendências state ────────────────────────────────────────────────
  const [caixasPendencias, setCaixasPendencias] = useState<CaixaMesPendencia[]>([]);

  // ── caixa de entrada state ─────────────────────────────────────────────────
  const [novos, setNovos] = useState({ curriculos: 0, feedbacks: 0 });

  // ── load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (postoIds.length > 0) {
      loadRecados();
      loadAlertas();
      loadAfericoes();
    }
  }, [postoIds]);

  useEffect(() => {
    if (targetPostoId) loadCaixasPendencias();
  }, [targetPostoId]);

  useEffect(() => {
    if (hasPermission('caixa-entrada')) loadNovos();
  }, [hasPermission]);

  useEffect(() => {
    if (user) loadAlertPrefs();
  }, [user?.id]);

  async function loadAlertPrefs() {
    if (!user) return;
    const { data } = await (supabase as any)
      .from('user_alert_prefs')
      .select('prefs')
      .eq('user_id', user.id)
      .maybeSingle();
    setAlertPrefs(data?.prefs ?? {});
  }

  async function loadAfericoes() {
    const { data, error } = await (supabase as any)
      .from('afericoes')
      .select('posto_id, data')
      .in('posto_id', postoIds)
      .order('data', { ascending: false });
    if (error) return;

    const grouped = new Map<string, string[]>();
    (data ?? []).forEach((row: any) => {
      const arr = grouped.get(row.posto_id) ?? [];
      if (arr.length < 3) arr.push(row.data);
      grouped.set(row.posto_id, arr);
    });

    setAfericoesPorPosto(
      postoIds.map((pid) => ({
        postoId: pid,
        postoNome: allPostos.find((p) => p.id === pid)?.nome ?? '',
        datas: grouped.get(pid) ?? [],
      }))
    );
  }

  async function loadCaixasPendencias() {
    if (!targetPostoId) return;

    const today = new Date().toISOString().split('T')[0];
    const months = [2, 1, 0].map((ago) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - ago);
      const y = d.getFullYear();
      const mo = d.getMonth();
      const start = `${y}-${String(mo + 1).padStart(2, '0')}-01`;
      const lastDay = `${y}-${String(mo + 1).padStart(2, '0')}-${String(new Date(y, mo + 1, 0).getDate()).padStart(2, '0')}`;
      const end = lastDay < today ? lastDay : today; // não contar dias futuros
      const raw = d.toLocaleDateString('pt-BR', { month: 'long' });
      const label = raw.charAt(0).toUpperCase() + raw.slice(1);
      return { start, end, label };
    });

    const rangeStart = months[0].start;
    const rangeEnd = today; // nunca buscar além de hoje

    const [{ data: brinks }, { data: manuais }, { data: conferencias }] = await Promise.all([
      supabase.from('depositos_brinks').select('data_caixa, centro_custo')
        .eq('posto_id', targetPostoId)
        .not('data_caixa', 'is', null).not('centro_custo', 'is', null)
        .gte('data_caixa', rangeStart).lte('data_caixa', rangeEnd),
      supabase.from('depositos_manuais').select('data, centro_custo')
        .eq('posto_id', targetPostoId)
        .not('centro_custo', 'is', null).gte('data', rangeStart).lte('data', rangeEnd),
      supabase.from('resumo_conferencia').select('data, centro_custo, conferido, turno')
        .eq('posto_id', targetPostoId).gte('data', rangeStart).lte('data', rangeEnd),
    ]);

    const result = months.map(({ start, end, label }) => {
      const mBrinks = (brinks ?? []).filter((b: any) => b.data_caixa >= start && b.data_caixa <= end);
      const mManuais = (manuais ?? []).filter((m: any) => m.data >= start && m.data <= end);
      const mConfs = (conferencias ?? []).filter((c: any) => c.data >= start && c.data <= end);

      const depositGroups = new Set<string>();
      mBrinks.forEach((b: any) => depositGroups.add(`${b.data_caixa}|${b.centro_custo}`));
      mManuais.forEach((mn: any) => { if (mn.data) depositGroups.add(`${mn.data}|${mn.centro_custo}`); });

      // statusMap: (data, cc) → conferido; linha com turno=null tem preferência
      const statusMap = new Map<string, string>();
      mConfs.forEach((c: any) => {
        const key = `${c.data}|${c.centro_custo ?? 'SEM CENTRO'}`;
        if (!statusMap.has(key) || c.turno === null) statusMap.set(key, c.conferido);
      });

      let count = 0;
      depositGroups.forEach((key) => {
        if ((statusMap.get(key) ?? 'PENDENTE') !== 'OK') count++;
      });

      return { label, count };
    });

    setCaixasPendencias(result);
  }

  async function saveAlertPrefs(prefs: Record<string, boolean>) {
    if (!user) return;
    setSavingPrefs(true);
    const { error } = await (supabase as any)
      .from('user_alert_prefs')
      .upsert({ user_id: user.id, prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setSavingPrefs(false);
    if (error) { toast.error('Erro ao salvar preferências'); return; }
    setAlertPrefs(prefs);
    setShowAlertConfig(false);
    toast.success('Preferências de alertas salvas');
  }

  function openAlertConfig() {
    setLocalPrefs({ ...alertPrefs });
    setShowAlertConfig(true);
  }

  async function loadNovos() {
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      (supabase as any).from('publico_curriculos').select('id', { count: 'exact', head: true }).eq('status', 'Novo'),
      (supabase as any).from('publico_feedback').select('id', { count: 'exact', head: true }).eq('status', 'Novo'),
    ]);
    setNovos({ curriculos: c1 ?? 0, feedbacks: c2 ?? 0 });
  }

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

    const alertDate3 = new Date();
    alertDate3.setDate(alertDate3.getDate() + 3);
    const alertDate3Str = alertDate3.toISOString().split('T')[0];

    const [{ data: alvaras }, { data: treinamentosRaw }, { data: contratos }, { data: funcParaFerias }, { data: entrevistasRaw }] = await Promise.all([
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
      // Parallel: active funcionários for vacation alert computation
      (supabase as any)
        .from('pessoal_funcionarios')
        .select('id, nome, posto_id, data_admissao')
        .in('posto_id', postoIds)
        .eq('status', 'ativo')
        .not('data_admissao', 'is', null),
      // Interviews in the next 3 days with no result yet
      (supabase as any)
        .from('candidatos_entrevistas')
        .select('id, data_entrevista, horario, local, entrevistador, pessoal_candidatos(nome, posto_id)')
        .is('resultado', null)
        .gte('data_entrevista', today)
        .lte('data_entrevista', alertDate3Str),
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

    // ── férias alerts ───────────────────────────────────────────────────────
    const funcFeriaIds = (funcParaFerias ?? []).map((f: any) => f.id);
    if (funcFeriaIds.length > 0) {
      const { data: feriasList } = await (supabase as any)
        .from('pessoal_ferias')
        .select('funcionario_id, periodo_aquisitivo_inicio, dias_gozados, dias_vendidos, alerta_meses, saldo_dias')
        .in('funcionario_id', funcFeriaIds);

      const feriasMap = new Map<string, FeriasRecord[]>();
      (feriasList ?? []).forEach((f: any) => {
        if (!feriasMap.has(f.funcionario_id)) feriasMap.set(f.funcionario_id, []);
        feriasMap.get(f.funcionario_id)!.push(f as FeriasRecord);
      });

      (funcParaFerias ?? []).forEach((func: any) => {
        const alert = computeFeriasAlert(func.data_admissao, feriasMap.get(func.id) ?? []);
        if (!alert) return;
        const postoNome = allPostos.find((p) => p.id === func.posto_id)?.nome ?? '';
        items.push({
          id: func.id,
          tipo: 'ferias',
          nome: `Férias — ${func.nome}`,
          detalhe: `Vence em ${formatDateBR(alert.fimAquisitivo)} · Último prazo: ${formatDateBR(alert.vencimento)}`,
          postoNome,
          dias: alert.diasUntilVencimento,
          dataVencimento: alert.vencimento,
        });
      });
    }

    // ── entrevistas agendadas (próximos 3 dias) ─────────────────────────────
    (entrevistasRaw ?? []).forEach((e: any) => {
      const cand = e.pessoal_candidatos;
      if (!cand || !postoIds.includes(cand.posto_id)) return;
      const postoNome = allPostos.find((p) => p.id === cand.posto_id)?.nome ?? '';
      const hora = (e.horario ?? '').slice(0, 5);
      items.push({
        id: e.id,
        tipo: 'entrevista',
        nome: `Entrevista — ${cand.nome}`,
        detalhe: `${hora}${e.local ? ' · ' + e.local : ''}${e.entrevistador ? ' · ' + e.entrevistador : ''}`,
        postoNome,
        dias: daysUntil(e.data_entrevista),
        dataVencimento: e.data_entrevista,
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

  // ── derived from alert prefs ───────────────────────────────────────────────

  const isPrefOn = (key: string) => alertPrefs[key] !== false;

  const alertasFiltrados = useMemo(
    () => alertas.filter((a) => isPrefOn(TIPO_TO_PREF[a.tipo])),
    [alertas, alertPrefs],
  );

  const showCurriculos = isPrefOn('curriculos');
  const showFeedbacks  = isPrefOn('feedbacks');

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

      {/* ── SEÇÃO 2.5: CAIXA DE ENTRADA ──────────────────────────────────── */}
      {hasPermission('caixa-entrada') && ((showCurriculos && novos.curriculos > 0) || (showFeedbacks && novos.feedbacks > 0)) && (
        <Link to="/caixa-entrada" className="block">
          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-4 py-3 flex items-center gap-3 hover:bg-blue-100 dark:hover:bg-blue-950/40 transition-colors">
            <Inbox className="w-4 h-4 text-blue-600 shrink-0" />
            <div className="flex-1 flex flex-wrap items-center gap-2 text-sm text-blue-800 dark:text-blue-200">
              <span className="font-medium">Caixa de Entrada</span>
              {showCurriculos && novos.curriculos > 0 && (
                <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-[10px]">
                  {novos.curriculos} {novos.curriculos === 1 ? 'novo currículo' : 'novos currículos'}
                </Badge>
              )}
              {showFeedbacks && novos.feedbacks > 0 && (
                <Badge className="bg-purple-600 hover:bg-purple-600 text-white text-[10px]">
                  {novos.feedbacks} {novos.feedbacks === 1 ? 'novo feedback' : 'novos feedbacks'}
                </Badge>
              )}
            </div>
            <span className="text-xs text-blue-600 shrink-0">Ver →</span>
          </div>
        </Link>
      )}

      {/* ── SEÇÃO 3: ALERTAS DE DOCUMENTOS ───────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Alertas — Documentos e Treinamentos</h2>
          {role === 'admin' && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={openAlertConfig} title="Configurar alertas">
              <Settings className="w-4 h-4" />
            </Button>
          )}
        </div>

        {alertasFiltrados.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum alerta no momento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertasFiltrados.map((a) => {
              const isVencido = a.dias < 0;
              const isProximo = a.dias >= 0 && a.dias <= 30;

              return (
                <div
                  key={`${a.tipo}-${a.id}`}
                  className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${
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
                      <GraduationCap className={`w-5 h-5 ${isVencido ? 'text-red-500' : isProximo ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                    ) : a.tipo === 'contrato' ? (
                      <Clock className={`w-5 h-5 ${isVencido ? 'text-red-500' : isProximo ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                    ) : a.tipo === 'ferias' ? (
                      <CalendarX2 className={`w-5 h-5 ${isVencido ? 'text-red-500' : isProximo ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                    ) : a.tipo === 'entrevista' ? (
                      <CalendarClock className={`w-5 h-5 ${isProximo ? 'text-purple-600' : 'text-muted-foreground'}`} />
                    ) : (
                      <FileWarning className={`w-5 h-5 ${isVencido ? 'text-red-500' : isProximo ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-sm font-semibold leading-snug truncate cursor-default">{a.nome}</p>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="start" className="max-w-xs break-words">
                        <p className="text-sm">{a.nome}</p>
                      </TooltipContent>
                    </Tooltip>
                    {a.detalhe && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-muted-foreground truncate cursor-default mt-0.5">{a.detalhe}</p>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start" className="max-w-xs break-words">
                          <p className="text-sm">{a.detalhe}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {allPostos.length > 1 && a.postoNome && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{a.postoNome}</p>
                    )}
                  </div>

                  {/* Days badge */}
                  <div className="shrink-0 text-right">
                    <Badge
                      className={`text-xs whitespace-nowrap ${
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
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(a.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SEÇÃO 4: AFERIÇÕES ────────────────────────────────────────────── */}
      {isPrefOn('afericoes') && afericoesPorPosto.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Aferições
          </h2>
          <Card>
            <CardContent className="py-3 px-4 divide-y divide-border">
              {afericoesPorPosto.map(({ postoId, postoNome, datas }) => {
                const semAfericao = datas.length === 0;
                const diasSemAfericao = datas.length > 0 ? daysSince(datas[0]) : null;
                const atrasado = diasSemAfericao !== null && diasSemAfericao > 14;

                const infoText = semAfericao
                  ? 'Nenhuma aferição registrada'
                  : atrasado
                  ? `Sem aferição há ${diasSemAfericao} ${diasSemAfericao === 1 ? 'dia' : 'dias'}`
                  : `Últimas aferições: ${datas.map(formatDateShort).join(', ')}`;

                const textClass = atrasado
                  ? 'text-red-600 dark:text-red-400'
                  : semAfericao
                  ? 'text-muted-foreground'
                  : 'text-foreground';

                return (
                  <div key={postoId} className="py-2 first:pt-0 last:pb-0 text-sm">
                    {allPostos.length > 1 && postoNome && (
                      <span className={`font-semibold ${textClass}`}>{postoNome} — </span>
                    )}
                    <span className={textClass}>{infoText}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── SEÇÃO 5: CAIXAS COM PENDÊNCIA ────────────────────────────────── */}
      {isPrefOn('caixas') && caixasPendencias.length > 0 && (() => {
        const allOk = caixasPendencias.every((m) => m.count === 0);
        return (
          <div className="space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ListChecks className="w-4 h-4" />
              Caixas com Pendência
            </h2>
            <Link to="/resumo" className="block">
              <Card className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                allOk
                  ? 'border-green-300 bg-green-50/40 dark:border-green-700 dark:bg-green-950/10'
                  : 'border-yellow-300 bg-yellow-50/40 dark:border-yellow-700 dark:bg-yellow-950/10'
              }`}>
                <CardContent className="py-3 px-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
                    {caixasPendencias.map(({ label, count }) => (
                      <span key={label} className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">{label}:</span>
                        <Badge className={`text-xs ${count > 0 ? 'bg-yellow-500 hover:bg-yellow-500' : 'bg-green-600 hover:bg-green-600'} text-white`}>
                          {count}
                        </Badge>
                      </span>
                    ))}
                    {allOk && (
                      <span className="ml-auto text-xs text-green-600 dark:text-green-400">Tudo conferido ✓</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        );
      })()}

      {/* ── MODAL: Configuração de alertas ───────────────────────────────── */}
      <Dialog open={showAlertConfig} onOpenChange={setShowAlertConfig}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Configurar Alertas</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Escolha quais alertas aparecem no seu Dashboard.
          </p>
          <div className="space-y-3 py-1">
            {ALERT_PREFS_DEFS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer select-none min-h-[36px]">
                <Checkbox
                  checked={localPrefs[key] !== false}
                  onCheckedChange={(checked) =>
                    setLocalPrefs((prev) => ({ ...prev, [key]: !!checked }))
                  }
                  className="h-5 w-5 shrink-0"
                />
                <span className="text-sm leading-tight">{label}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setShowAlertConfig(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={savingPrefs} onClick={() => saveAlertPrefs(localPrefs)}>
              {savingPrefs ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
