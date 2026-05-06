import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Save, Search, AlertTriangle, Calendar, Briefcase, UserPlus } from 'lucide-react';
import { useListaConfig } from '@/hooks/useListaConfig';

// ─── types ──────────────────────────────────────────────────────────────────

interface Candidato {
  id: string;
  posto_id: string;
  nome: string;
  cpf: string;
  telefone: string | null;
  telefone_terceiro?: boolean | null;
  terceiro_nome?: string | null;
  terceiro_parentesco?: string | null;
  cargo_pretendido: string;
  status: string;
  observacoes: string | null;
  funcionario_id?: string | null;
  created_at: string;
}

interface Entrevista {
  id: string;
  candidato_id: string;
  posto_id: string;
  data_entrevista: string;
  horario: string;
  local: string | null;
  entrevistador: string | null;
  observacoes: string | null;
  resultado: string | null;
  status_resultante: string | null;
  motivo_reprovacao: string | null;
  dispensado_definitivamente: boolean;
  created_at: string;
}

interface Diaria {
  id: string;
  candidato_id: string;
  posto_id: string;
  data: string;
  horario_entrada: string;
  horario_saida: string;
  valor: number | null;
  observacoes_gerente: string | null;
  created_at: string;
}

interface CPFHistorico {
  funcionarios: { nome: string; status: string; data_admissao: string; cargo: string }[];
  candidatos: { nome: string; status: string; cargo_pretendido: string; created_at: string; posto_nome: string }[];
}

// ─── constants ───────────────────────────────────────────────────────────────

const CARGOS_FALLBACK = [
  'Auxiliar Administrativo', 'Chefe de Pista', 'Frentista', 'Funcionário de Loja',
  'Gerente', 'Repositor de Loja', 'Secretária Administrativa', 'Trocador de Óleo', 'Outros',
];

const STATUSES = [
  'Novo', 'Em análise', 'Entrevista Agendada', 'Aprovado', 'Em diárias', 'Contratado',
  'Reprovado', 'Não compareceu', 'Dispensado', 'Desistiu',
] as const;

const STATUS_COLORS: Record<string, string> = {
  'Novo':                'bg-blue-500 hover:bg-blue-500',
  'Em análise':          'bg-yellow-500 hover:bg-yellow-500 text-black',
  'Entrevista Agendada': 'bg-purple-500 hover:bg-purple-500',
  'Aprovado':            'bg-green-600 hover:bg-green-600',
  'Em diárias':          'bg-teal-600 hover:bg-teal-600',
  'Contratado':          'bg-emerald-700 hover:bg-emerald-700',
  'Reprovado':           'bg-red-500 hover:bg-red-500',
  'Não compareceu':      'bg-orange-500 hover:bg-orange-500',
  'Dispensado':          'bg-slate-600 hover:bg-slate-600',
  'Desistiu':            'bg-gray-400 hover:bg-gray-400',
};

const EMPTY_FORM = {
  nome: '', cpf: '', telefone: '', telefone_terceiro: false, terceiro_nome: '', terceiro_parentesco: '',
  cargo_pretendido: '', posto_id: '', status: 'Novo', observacoes: '',
};

const EMPTY_ENTREVISTA_FORM = {
  data_entrevista: '', horario: '', local: '', entrevistador: '', observacoes: '',
};

const EMPTY_DIARIA_FORM = {
  data: '', horario_entrada: '', horario_saida: '', posto_id: '', valor: '', observacoes_gerente: '',
};

const ESCALAS_FALLBACK = ['12x36', '6x1', 'Segunda a Sexta', 'Segunda a Sábado', 'Outros'];

const EMPTY_CONTRATAR_FORM = {
  data_admissao: '',
  rg: '',
  data_nascimento: '',
  email: '',
  observacoes: '',
  em_experiencia: false,
  prazo_experiencia: '',
  inicio_experiencia: '',
  renovavel: false,
  prazo_renovacao: '',
  escala_trabalho: '',
  escala_outros: '',
  horario_entrada: '',
  horario_saida: '',
  horario_sabado_entrada: '',
  horario_sabado_saida: '',
  carga_horaria_semanal: '44',
  adicional_noturno: false as boolean,
  intervalo_descanso: '1',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatCPF(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function rawCPF(masked: string) { return masked.replace(/\D/g, ''); }

function formatDate(str: string | null) {
  if (!str) return '—';
  const [y, m, day] = str.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
}

function formatTime(t: string | null) {
  if (!t) return '';
  return t.slice(0, 5);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function horaToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function computeHorasExtraFixas(
  escala: string, entrada: string, saida: string,
  sabEntrada: string, sabSaida: string,
  cargaHorariaSemanal: number, intervaloDescanso: number = 1,
): number {
  if (!escala || escala === 'Outros' || !entrada || !saida) return 0;
  const intervaloMin = intervaloDescanso * 60;
  const dailyMinutes = horaToMinutes(saida) - horaToMinutes(entrada) - intervaloMin;
  if (dailyMinutes <= 0) return 0;
  const dailyHours = dailyMinutes / 60;
  let weeklyHours: number;
  if (escala === 'Segunda a Sexta') {
    weeklyHours = dailyHours * 5;
  } else if (escala === 'Segunda a Sábado' || escala === '6x1') {
    const sabBruto = (sabEntrada && sabSaida)
      ? Math.max(0, horaToMinutes(sabSaida) - horaToMinutes(sabEntrada))
      : horaToMinutes(saida) - horaToMinutes(entrada);
    const sabMin = Math.max(0, sabBruto - intervaloMin);
    weeklyHours = dailyHours * 5 + sabMin / 60;
  } else if (escala === '12x36') {
    weeklyHours = dailyHours * 3.5;
  } else {
    return 0;
  }
  return Math.round(Math.max(0, weeklyHours - cargaHorariaSemanal) * 4.333);
}

function isEntrevistaPast(e: Entrevista): boolean {
  const dt = new Date(e.data_entrevista + 'T' + (e.horario || '23:59:00'));
  return dt < new Date();
}

// ─── main component ──────────────────────────────────────────────────────────

export default function Recrutamento() {
  const cargos  = useListaConfig('cargos', CARGOS_FALLBACK);
  const escalas = useListaConfig('escalas_trabalho', ESCALAS_FALLBACK);
  const { selectedPostoId, allPostos, postoNome } = useAuth();

  const isAdmin = allPostos.length > 0;
  const postoMap = useMemo(() => {
    const m: Record<string, string> = {};
    allPostos.forEach((p) => { m[p.id] = p.nome; });
    return m;
  }, [allPostos]);

  const getPostoNome = (id: string) => postoMap[id] ?? postoNome ?? '—';

  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [loading, setLoading] = useState(false);

  // filters
  const [search, setSearch] = useState('');
  const [filterPosto, setFilterPosto] = useState('__all__');
  const [filterStatus, setFilterStatus] = useState('__all__');

  // candidate dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Candidato | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // CPF history
  const [cpfHistorico, setCpfHistorico] = useState<CPFHistorico | null>(null);
  const cpfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // delete
  const [deleteTarget, setDeleteTarget] = useState<Candidato | null>(null);

  // entrevistas dialog
  const [entrevistaOpen, setEntrevistaOpen] = useState(false);
  const [entrevistaCandidate, setEntrevistaCandidate] = useState<Candidato | null>(null);
  const [entrevistas, setEntrevistas] = useState<Entrevista[]>([]);
  const [loadingEntrevistas, setLoadingEntrevistas] = useState(false);
  const [showEntrevistaForm, setShowEntrevistaForm] = useState(false);
  const [entrevistaForm, setEntrevistaForm] = useState({ ...EMPTY_ENTREVISTA_FORM });
  const [savingEntrevista, setSavingEntrevista] = useState(false);

  // cancel entrevista confirm
  const [cancelEntrevistaTarget, setCancelEntrevistaTarget] = useState<Entrevista | null>(null);

  // result recording (inline within entrevista dialog)
  const [resultTarget, setResultTarget] = useState<string | null>(null);
  const [resultForm, setResultForm] = useState({
    status_resultante: 'Em análise', motivo: '', dispensado: false,
  });
  const [savingResult, setSavingResult] = useState(false);

  // contratação dialog
  const [contratarOpen, setContratarOpen] = useState(false);
  const [contratarCandidate, setContratarCandidate] = useState<Candidato | null>(null);
  const [contratarForm, setContratarForm] = useState({ ...EMPTY_CONTRATAR_FORM });
  const [savingContratar, setSavingContratar] = useState(false);

  // diárias dialog
  const [diariaOpen, setDiariaOpen] = useState(false);
  const [diariaCandidate, setDiariaCandidate] = useState<Candidato | null>(null);
  const [diarias, setDiarias] = useState<Diaria[]>([]);
  const [loadingDiarias, setLoadingDiarias] = useState(false);
  const [showDiariaForm, setShowDiariaForm] = useState(false);
  const [diariaForm, setDiariaForm] = useState({ ...EMPTY_DIARIA_FORM });
  const [savingDiaria, setSavingDiaria] = useState(false);

  // ─── load ────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);
    let query = (supabase as any)
      .from('pessoal_candidatos')
      .select('*')
      .order('created_at', { ascending: false });

    if (!isAdmin && selectedPostoId) {
      query = query.eq('posto_id', selectedPostoId);
    }

    const { data, error } = await query;
    if (error) toast.error('Erro ao carregar candidatos: ' + error.message);
    else setCandidatos(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [selectedPostoId]);

  // ─── CPF history check ────────────────────────────────────────────────────

  function handleCPFChange(raw: string) {
    const masked = formatCPF(raw);
    setForm((f) => ({ ...f, cpf: masked }));
    setCpfHistorico(null);

    if (cpfTimer.current) clearTimeout(cpfTimer.current);
    const digits = rawCPF(masked);
    if (digits.length < 11) return;

    cpfTimer.current = setTimeout(async () => {
      const [{ data: funcs }, { data: cands }] = await Promise.all([
        (supabase as any)
          .from('pessoal_funcionarios')
          .select('nome, status, data_admissao, cargo')
          .eq('cpf', digits),
        (supabase as any)
          .from('pessoal_candidatos')
          .select('nome, status, cargo_pretendido, created_at, posto_id')
          .eq('cpf', digits)
          .neq('id', editTarget?.id ?? ''),
      ]);

      const funcionarios = funcs ?? [];
      const candidatosHist = (cands ?? []).map((c: any) => ({
        ...c,
        posto_nome: getPostoNome(c.posto_id),
      }));

      if (funcionarios.length > 0 || candidatosHist.length > 0) {
        setCpfHistorico({ funcionarios, candidatos: candidatosHist });
      }
    }, 400);
  }

  // ─── save candidate ───────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.nome.trim()) { toast.error('Informe o nome completo'); return; }
    if (rawCPF(form.cpf).length < 11) { toast.error('CPF inválido'); return; }
    if (!form.telefone.trim()) { toast.error('Informe o WhatsApp'); return; }
    if (form.telefone_terceiro && !form.terceiro_nome.trim()) { toast.error('Informe o nome do terceiro'); return; }
    if (!form.cargo_pretendido) { toast.error('Selecione o cargo pretendido'); return; }
    const postoId = isAdmin ? form.posto_id : (selectedPostoId ?? '');
    if (!postoId) { toast.error('Selecione o posto'); return; }

    setSaving(true);
    const payload = {
      posto_id: postoId,
      nome: form.nome.trim(),
      cpf: rawCPF(form.cpf),
      telefone: form.telefone.trim(),
      telefone_terceiro: form.telefone_terceiro,
      terceiro_nome: form.telefone_terceiro ? (form.terceiro_nome.trim() || null) : null,
      terceiro_parentesco: form.telefone_terceiro ? (form.terceiro_parentesco || null) : null,
      cargo_pretendido: form.cargo_pretendido,
      status: form.status,
      observacoes: form.observacoes.trim() || null,
    };

    let error;
    if (editTarget) {
      ({ error } = await (supabase as any).from('pessoal_candidatos').update(payload).eq('id', editTarget.id));
    } else {
      ({ error } = await (supabase as any).from('pessoal_candidatos').insert(payload));
    }

    if (error) { toast.error('Erro ao salvar: ' + error.message); }
    else {
      toast.success(editTarget ? 'Candidato atualizado' : 'Candidato cadastrado');
      setDialogOpen(false);
      await load();
    }
    setSaving(false);
  }

  // ─── delete candidate ────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from('pessoal_candidatos').delete().eq('id', deleteTarget.id);
    if (error) toast.error('Erro ao excluir: ' + error.message);
    else { toast.success('Candidato excluído'); setDeleteTarget(null); await load(); }
  }

  async function handleCandidatoStatus(id: string, status: string) {
    const { error } = await (supabase as any)
      .from('pessoal_candidatos').update({ status }).eq('id', id);
    if (error) { toast.error('Erro ao atualizar status'); return; }
    setCandidatos((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
  }

  // ─── open helpers ─────────────────────────────────────────────────────────

  function openNew() {
    setEditTarget(null);
    setCpfHistorico(null);
    setForm({ ...EMPTY_FORM, posto_id: isAdmin ? '' : (selectedPostoId ?? '') });
    setDialogOpen(true);
  }

  function openEdit(c: Candidato) {
    setEditTarget(c);
    setCpfHistorico(null);
    setForm({
      nome: c.nome, cpf: formatCPF(c.cpf), telefone: c.telefone ?? '',
      telefone_terceiro: !!c.telefone_terceiro,
      terceiro_nome: c.terceiro_nome ?? '',
      terceiro_parentesco: c.terceiro_parentesco ?? '',
      cargo_pretendido: c.cargo_pretendido, posto_id: c.posto_id,
      status: c.status, observacoes: c.observacoes ?? '',
    });
    setDialogOpen(true);
  }

  // ─── entrevistas ──────────────────────────────────────────────────────────

  async function loadEntrevistas(candidatoId: string) {
    setLoadingEntrevistas(true);
    const { data, error } = await (supabase as any)
      .from('candidatos_entrevistas')
      .select('*')
      .eq('candidato_id', candidatoId)
      .order('data_entrevista', { ascending: true });
    if (error) toast.error('Erro ao carregar entrevistas: ' + error.message);
    else setEntrevistas(data ?? []);
    setLoadingEntrevistas(false);
  }

  function openEntrevistaDialog(c: Candidato) {
    setEntrevistaCandidate(c);
    setEntrevistas([]);
    setShowEntrevistaForm(false);
    setEntrevistaForm({ ...EMPTY_ENTREVISTA_FORM });
    setResultTarget(null);
    setEntrevistaOpen(true);
    loadEntrevistas(c.id);
  }

  async function handleAgendarEntrevista() {
    if (!entrevistaForm.data_entrevista) { toast.error('Informe a data da entrevista'); return; }
    if (!entrevistaForm.horario) { toast.error('Informe o horário da entrevista'); return; }
    if (!entrevistaCandidate) return;

    setSavingEntrevista(true);
    const payload = {
      candidato_id: entrevistaCandidate.id,
      posto_id: entrevistaCandidate.posto_id,
      data_entrevista: entrevistaForm.data_entrevista,
      horario: entrevistaForm.horario,
      local: entrevistaForm.local.trim() || null,
      entrevistador: entrevistaForm.entrevistador.trim() || null,
      observacoes: entrevistaForm.observacoes.trim() || null,
    };

    const { error } = await (supabase as any).from('candidatos_entrevistas').insert(payload);
    if (error) { toast.error('Erro ao agendar: ' + error.message); setSavingEntrevista(false); return; }

    toast.success('Entrevista agendada');
    setShowEntrevistaForm(false);
    setEntrevistaForm({ ...EMPTY_ENTREVISTA_FORM });
    await loadEntrevistas(entrevistaCandidate.id);
    await load();
    setSavingEntrevista(false);
  }

  async function handleNaoCompareceu(e: Entrevista) {
    if (!entrevistaCandidate) return;
    const { error } = await (supabase as any)
      .from('candidatos_entrevistas')
      .update({ resultado: 'Não compareceu', status_resultante: 'Não compareceu' })
      .eq('id', e.id);
    if (error) { toast.error('Erro ao registrar: ' + error.message); return; }

    await (supabase as any)
      .from('pessoal_candidatos')
      .update({ status: 'Não compareceu' })
      .eq('id', entrevistaCandidate.id);

    toast.success('Resultado registrado');
    await loadEntrevistas(entrevistaCandidate.id);
    await load();
  }

  async function handleCancelarEntrevista() {
    if (!cancelEntrevistaTarget || !entrevistaCandidate) return;

    const { error } = await (supabase as any)
      .from('candidatos_entrevistas')
      .update({ resultado: 'Cancelada', status_resultante: 'Cancelada' })
      .eq('id', cancelEntrevistaTarget.id);

    if (error) { toast.error('Erro ao cancelar: ' + error.message); setCancelEntrevistaTarget(null); return; }

    // Se não restar nenhuma entrevista sem resultado e candidato está como "Entrevista Agendada", reverter
    if (entrevistaCandidate.status === 'Entrevista Agendada') {
      const { count } = await (supabase as any)
        .from('candidatos_entrevistas')
        .select('*', { count: 'exact', head: true })
        .eq('candidato_id', entrevistaCandidate.id)
        .is('resultado', null);

      if ((count ?? 0) === 0) {
        await (supabase as any)
          .from('pessoal_candidatos')
          .update({ status: 'Em análise' })
          .eq('id', entrevistaCandidate.id);
        setEntrevistaCandidate((prev) => prev ? { ...prev, status: 'Em análise' } : prev);
      }
    }

    toast.success('Entrevista cancelada');
    setCancelEntrevistaTarget(null);
    await loadEntrevistas(entrevistaCandidate.id);
    await load();
  }

  async function handleCompareceuSave() {
    if (!resultTarget || !entrevistaCandidate) return;
    if (resultForm.status_resultante === 'Reprovado' && !resultForm.motivo.trim()) {
      toast.error('Informe o motivo da reprovação');
      return;
    }

    setSavingResult(true);
    const finalStatus = resultForm.dispensado ? 'Dispensado' : resultForm.status_resultante;

    const { error } = await (supabase as any)
      .from('candidatos_entrevistas')
      .update({
        resultado: 'Compareceu',
        status_resultante: finalStatus,
        motivo_reprovacao: resultForm.status_resultante === 'Reprovado' ? resultForm.motivo.trim() : null,
        dispensado_definitivamente: resultForm.dispensado,
      })
      .eq('id', resultTarget);

    if (error) { toast.error('Erro ao registrar: ' + error.message); setSavingResult(false); return; }

    await (supabase as any)
      .from('pessoal_candidatos')
      .update({ status: finalStatus })
      .eq('id', entrevistaCandidate.id);

    toast.success('Resultado registrado');
    setResultTarget(null);
    await loadEntrevistas(entrevistaCandidate.id);
    await load();
    setSavingResult(false);
  }

  // ─── contratação ─────────────────────────────────────────────────────────

  function openContratar(c: Candidato) {
    setContratarCandidate(c);
    setContratarForm({ ...EMPTY_CONTRATAR_FORM });
    setContratarOpen(true);
  }

  async function handleContratar() {
    if (!contratarCandidate) return;
    if (!contratarForm.data_admissao) { toast.error('Informe a data de admissão'); return; }

    setSavingContratar(true);

    const payload: Record<string, unknown> = {
      posto_id: contratarCandidate.posto_id,
      nome: contratarCandidate.nome,
      cpf: contratarCandidate.cpf,
      telefone: contratarCandidate.telefone,
      cargo: contratarCandidate.cargo_pretendido,
      data_admissao: contratarForm.data_admissao,
      rg: contratarForm.rg.trim() || null,
      data_nascimento: contratarForm.data_nascimento || null,
      email: contratarForm.email.trim() || null,
      observacoes: contratarForm.observacoes.trim() || null,
      status: 'ativo',
      em_experiencia: contratarForm.em_experiencia,
      prazo_experiencia: contratarForm.em_experiencia && contratarForm.prazo_experiencia ? Number(contratarForm.prazo_experiencia) : null,
      inicio_experiencia: contratarForm.em_experiencia && contratarForm.inicio_experiencia ? contratarForm.inicio_experiencia : null,
      renovavel: contratarForm.em_experiencia ? contratarForm.renovavel : null,
      prazo_renovacao: contratarForm.em_experiencia && contratarForm.renovavel && contratarForm.prazo_renovacao ? Number(contratarForm.prazo_renovacao) : null,
      escala_trabalho: contratarForm.escala_trabalho || null,
      escala_outros: contratarForm.escala_trabalho === 'Outros' ? (contratarForm.escala_outros || null) : null,
      horario_entrada: contratarForm.horario_entrada || null,
      horario_saida: contratarForm.horario_saida || null,
      horario_sabado_entrada: (contratarForm.escala_trabalho === '6x1' || contratarForm.escala_trabalho === 'Segunda a Sábado') ? (contratarForm.horario_sabado_entrada || null) : null,
      horario_sabado_saida: (contratarForm.escala_trabalho === '6x1' || contratarForm.escala_trabalho === 'Segunda a Sábado') ? (contratarForm.horario_sabado_saida || null) : null,
      carga_horaria_semanal: Number(contratarForm.carga_horaria_semanal) || 44,
      adicional_noturno: contratarForm.adicional_noturno,
      intervalo_descanso: Number(contratarForm.intervalo_descanso) || 1,
      horas_extras_fixas_mes: computeHorasExtraFixas(
        contratarForm.escala_trabalho,
        contratarForm.horario_entrada,
        contratarForm.horario_saida,
        contratarForm.horario_sabado_entrada,
        contratarForm.horario_sabado_saida,
        Number(contratarForm.carga_horaria_semanal) || 44,
        Number(contratarForm.intervalo_descanso) || 1,
      ),
    };

    const { data: inserted, error: insErr } = await (supabase as any)
      .from('pessoal_funcionarios')
      .insert(payload)
      .select('id')
      .single();

    if (insErr) { toast.error('Erro ao criar funcionário: ' + insErr.message); setSavingContratar(false); return; }

    const { error: updErr } = await (supabase as any)
      .from('pessoal_candidatos')
      .update({ status: 'Contratado', funcionario_id: inserted.id })
      .eq('id', contratarCandidate.id);

    if (updErr) { toast.error('Erro ao atualizar candidato: ' + updErr.message); setSavingContratar(false); return; }

    toast.success(`${contratarCandidate.nome} contratado(a) com sucesso!`);
    setContratarOpen(false);
    await load();
    setSavingContratar(false);
  }

  // ─── diárias ─────────────────────────────────────────────────────────────

  async function loadDiarias(candidatoId: string) {
    setLoadingDiarias(true);
    const { data, error } = await (supabase as any)
      .from('candidatos_diarias')
      .select('*')
      .eq('candidato_id', candidatoId)
      .order('data', { ascending: false });
    if (error) toast.error('Erro ao carregar diárias: ' + error.message);
    else setDiarias(data ?? []);
    setLoadingDiarias(false);
  }

  function openDiariasDialog(c: Candidato) {
    setDiariaCandidate(c);
    setDiarias([]);
    setShowDiariaForm(false);
    setDiariaForm({ ...EMPTY_DIARIA_FORM, posto_id: isAdmin ? '' : (selectedPostoId ?? '') });
    setDiariaOpen(true);
    loadDiarias(c.id);
  }

  async function handleSaveDiaria() {
    if (!diariaForm.data) { toast.error('Informe a data da diária'); return; }
    if (!diariaForm.horario_entrada) { toast.error('Informe o horário de entrada'); return; }
    if (!diariaForm.horario_saida) { toast.error('Informe o horário de saída'); return; }
    if (!diariaForm.valor.trim()) { toast.error('Informe o valor da diária'); return; }
    const valorNum = parseFloat(diariaForm.valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum < 0) { toast.error('Valor da diária inválido'); return; }
    const postoId = isAdmin ? diariaForm.posto_id : (selectedPostoId ?? '');
    if (!postoId) { toast.error('Selecione o posto'); return; }
    if (!diariaCandidate) return;

    setSavingDiaria(true);
    const { error } = await (supabase as any).from('candidatos_diarias').insert({
      candidato_id: diariaCandidate.id,
      valor: valorNum,
      posto_id: postoId,
      data: diariaForm.data,
      horario_entrada: diariaForm.horario_entrada,
      horario_saida: diariaForm.horario_saida,
      observacoes_gerente: diariaForm.observacoes_gerente.trim() || null,
    });

    if (error) { toast.error('Erro ao registrar diária: ' + error.message); setSavingDiaria(false); return; }

    toast.success('Diária registrada');
    setShowDiariaForm(false);
    setDiariaForm({ ...EMPTY_DIARIA_FORM, posto_id: isAdmin ? '' : (selectedPostoId ?? '') });
    await loadDiarias(diariaCandidate.id);
    await load();
    setSavingDiaria(false);
  }

  // ─── filtered data ────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return candidatos.filter((c) => {
      if (filterPosto !== '__all__' && c.posto_id !== filterPosto) return false;
      if (filterStatus !== '__all__' && c.status !== filterStatus) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.nome.toLowerCase().includes(q) && !c.cpf.includes(rawCPF(search))) return false;
      }
      return true;
    });
  }, [candidatos, filterPosto, filterStatus, search]);

  const pagination = usePagination(filtered, [filterPosto, filterStatus, search]);

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CPF..."
              className="h-8 text-xs pl-7 w-56"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isAdmin && (
            <Select value={filterPosto} onValueChange={setFilterPosto}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Todos os postos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os postos</SelectItem>
                {allPostos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={openNew}>
          <Plus className="w-3.5 h-3.5" /> Novo Candidato
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">CPF</TableHead>
                  <TableHead className="text-xs">Cargo Pretendido</TableHead>
                  {isAdmin && <TableHead className="text-xs">Posto</TableHead>}
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-xs text-muted-foreground py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && pagination.paginatedData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-xs text-muted-foreground py-8">
                      Nenhum candidato encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {pagination.paginatedData.map((c) => (
                  <TableRow key={c.id} className="text-xs">
                    <TableCell className="font-medium">{c.nome}</TableCell>
                    <TableCell>{formatCPF(c.cpf)}</TableCell>
                    <TableCell>{c.cargo_pretendido}</TableCell>
                    {isAdmin && <TableCell>{getPostoNome(c.posto_id)}</TableCell>}
                    <TableCell>
                      <Select value={c.status} onValueChange={(v) => handleCandidatoStatus(c.id, v)}>
                        <SelectTrigger className="h-6 w-[160px] text-[11px] border-0 shadow-none p-0 gap-1">
                          <Badge className={`text-[10px] text-white font-normal ${STATUS_COLORS[c.status] ?? 'bg-gray-400 hover:bg-gray-400'}`}>
                            {c.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              <div className="flex items-center gap-2">
                                <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLORS[s]?.split(' ')[0] ?? 'bg-gray-400'}`} />
                                {s}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{formatDate(c.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(c.status === 'Aprovado' || c.status === 'Em diárias') && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => openContratar(c)} title="Contratar">
                              <UserPlus className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-teal-600" onClick={() => openDiariasDialog(c)} title="Diárias">
                              <Briefcase className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-purple-600" onClick={() => openEntrevistaDialog(c)} title="Entrevistas">
                          <Calendar className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)} title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(c)} title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.handlePageSizeChange}
            itemLabel="candidatos"
          />
        </CardContent>
      </Card>

      {/* ── Candidate New/Edit Dialog ─────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar Candidato' : 'Novo Candidato'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            <div className="grid gap-3 py-2">

              {cpfHistorico && (cpfHistorico.funcionarios.length > 0 || cpfHistorico.candidatos.length > 0) && (
                <div className="rounded-md border border-yellow-400 bg-yellow-50 p-3 text-xs text-yellow-800 space-y-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Histórico encontrado para este CPF
                  </div>
                  {cpfHistorico.funcionarios.length > 0 && (
                    <div>
                      <p className="font-medium mb-1">Funcionário(s):</p>
                      {cpfHistorico.funcionarios.map((f, i) => (
                        <div key={i} className="ml-2">
                          <span className="font-medium">{f.nome}</span> — {f.cargo} —{' '}
                          <span className={f.status === 'ativo' ? 'text-green-700' : 'text-red-600'}>
                            {f.status === 'ativo' ? 'Ativo' : 'Desligado'}
                          </span>{' '}
                          (admissão: {formatDate(f.data_admissao)})
                        </div>
                      ))}
                    </div>
                  )}
                  {cpfHistorico.candidatos.length > 0 && (
                    <div>
                      <p className="font-medium mb-1">Candidatura(s) anterior(es):</p>
                      {cpfHistorico.candidatos.map((c, i) => (
                        <div key={i} className="ml-2">
                          <span className="font-medium">{c.nome}</span> — {c.cargo_pretendido} — {c.posto_nome} —{' '}
                          <Badge className={`text-[10px] text-white ${STATUS_COLORS[c.status] ?? 'bg-gray-400'}`}>
                            {c.status}
                          </Badge>{' '}
                          ({formatDate(c.created_at)})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Nome completo *</Label>
                  <Input
                    className="h-8 text-xs"
                    value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">CPF *</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="000.000.000-00"
                    value={form.cpf}
                    onChange={(e) => handleCPFChange(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">WhatsApp *</Label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="(00) 00000-0000"
                    value={form.telefone}
                    onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                  />
                </div>

                <div className="col-span-2 flex items-center gap-2">
                  <Checkbox
                    id="telefone_terceiro"
                    checked={form.telefone_terceiro}
                    onCheckedChange={(v) => setForm((f) => ({
                      ...f,
                      telefone_terceiro: !!v,
                      terceiro_nome: !!v ? f.terceiro_nome : '',
                      terceiro_parentesco: !!v ? f.terceiro_parentesco : '',
                    }))}
                  />
                  <Label htmlFor="telefone_terceiro" className="text-xs cursor-pointer">
                    Telefone de terceiro
                  </Label>
                </div>

                {form.telefone_terceiro && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Nome do terceiro *</Label>
                      <Input
                        className="h-8 text-xs"
                        value={form.terceiro_nome}
                        onChange={(e) => setForm((f) => ({ ...f, terceiro_nome: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Parentesco / Relação</Label>
                      <Select
                        value={form.terceiro_parentesco}
                        onValueChange={(v) => setForm((f) => ({ ...f, terceiro_parentesco: v }))}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          {['Mãe', 'Pai', 'Esposo(a)', 'Irmão(ã)', 'Amigo(a)', 'Outro'].map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Cargo pretendido *</Label>
                  <Select value={form.cargo_pretendido} onValueChange={(v) => setForm((f) => ({ ...f, cargo_pretendido: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {cargos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin && (
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Posto *</Label>
                    <Select value={form.posto_id} onValueChange={(v) => setForm((f) => ({ ...f, posto_id: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar posto" /></SelectTrigger>
                      <SelectContent>
                        {allPostos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Observações</Label>
                  <Textarea
                    className="text-xs min-h-[60px]"
                    value={form.observacoes}
                    onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Entrevistas Dialog ────────────────────────────────────────── */}
      <Dialog open={entrevistaOpen} onOpenChange={(o) => { if (!o) { setEntrevistaOpen(false); setResultTarget(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-600" />
              Entrevistas — {entrevistaCandidate?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1 space-y-3">
            {loadingEntrevistas && (
              <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
            )}
            {!loadingEntrevistas && entrevistas.length === 0 && !showEntrevistaForm && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhuma entrevista agendada.
              </p>
            )}

            {entrevistas.map((e) => {
              const past = isEntrevistaPast(e);
              const isResultTarget = resultTarget === e.id;
              return (
                <div key={e.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium">
                        {formatDate(e.data_entrevista)} às {formatTime(e.horario)}
                      </p>
                      {e.local && <p className="text-[10px] text-muted-foreground">Local: {e.local}</p>}
                      {e.entrevistador && <p className="text-[10px] text-muted-foreground">Entrevistador: {e.entrevistador}</p>}
                      {e.observacoes && <p className="text-[10px] text-muted-foreground italic">{e.observacoes}</p>}
                      {e.motivo_reprovacao && (
                        <p className="text-[10px] text-red-600">Motivo: {e.motivo_reprovacao}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      {e.resultado ? (
                        <>
                          <Badge className={`text-[10px] text-white ${
                            e.resultado === 'Compareceu' ? 'bg-green-600'
                            : e.resultado === 'Cancelada' ? 'bg-gray-400'
                            : 'bg-orange-500'
                          }`}>
                            {e.resultado}
                          </Badge>
                          {e.status_resultante && e.status_resultante !== e.resultado && e.resultado !== 'Cancelada' && (
                            <div>
                              <Badge className={`text-[10px] text-white ${STATUS_COLORS[e.status_resultante] ?? 'bg-gray-400'}`}>
                                {e.dispensado_definitivamente ? 'Dispensado definitivamente' : e.status_resultante}
                              </Badge>
                            </div>
                          )}
                        </>
                      ) : past ? (
                        <div className="flex flex-col gap-1">
                          <Button
                            size="sm"
                            className="h-6 text-[10px] px-2 bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              setResultTarget(e.id);
                              setResultForm({ status_resultante: 'Em análise', motivo: '', dispensado: false });
                            }}
                          >
                            Compareceu
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 text-orange-600 border-orange-400 hover:bg-orange-50"
                            onClick={() => handleNaoCompareceu(e)}
                          >
                            Não compareceu
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 text-gray-500 border-gray-300 hover:bg-gray-50"
                            onClick={() => setCancelEntrevistaTarget(e)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1 items-end">
                          <Badge className="text-[10px] bg-purple-500 text-white">Agendada</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] px-2 text-gray-500 border-gray-300 hover:bg-gray-50"
                            onClick={() => setCancelEntrevistaTarget(e)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Inline result form for "Compareceu" */}
                  {isResultTarget && (
                    <div className="border-t pt-2 space-y-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Resultado *</Label>
                        <Select
                          value={resultForm.status_resultante}
                          onValueChange={(v) => setResultForm((f) => ({ ...f, status_resultante: v, motivo: '', dispensado: false }))}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Em análise">Em análise</SelectItem>
                            <SelectItem value="Aprovado">Aprovado</SelectItem>
                            <SelectItem value="Reprovado">Reprovado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {resultForm.status_resultante === 'Reprovado' && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Motivo da reprovação *</Label>
                            <Input
                              className="h-7 text-xs"
                              value={resultForm.motivo}
                              onChange={(e) => setResultForm((f) => ({ ...f, motivo: e.target.value }))}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="dispensado"
                              checked={resultForm.dispensado}
                              onCheckedChange={(v) => setResultForm((f) => ({ ...f, dispensado: !!v }))}
                            />
                            <Label htmlFor="dispensado" className="text-[10px] cursor-pointer">
                              Dispensado definitivamente
                            </Label>
                          </div>
                        </>
                      )}
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setResultTarget(null)}>
                          Cancelar
                        </Button>
                        <Button size="sm" className="h-6 text-[10px] px-2" onClick={handleCompareceuSave} disabled={savingResult}>
                          {savingResult ? 'Salvando...' : 'Confirmar'}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Schedule form */}
            {showEntrevistaForm ? (
              <div className="rounded-md border border-primary/40 p-3 space-y-3">
                <p className="text-xs font-medium">Nova entrevista</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px]">Data *</Label>
                    <Input
                      type="date"
                      className="h-7 text-xs"
                      value={entrevistaForm.data_entrevista}
                      onChange={(e) => setEntrevistaForm((f) => ({ ...f, data_entrevista: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Horário *</Label>
                    <Input
                      type="time"
                      className="h-7 text-xs"
                      value={entrevistaForm.horario}
                      onChange={(e) => setEntrevistaForm((f) => ({ ...f, horario: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Local</Label>
                    <Input
                      className="h-7 text-xs"
                      value={entrevistaForm.local}
                      onChange={(e) => setEntrevistaForm((f) => ({ ...f, local: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Entrevistador</Label>
                    <Input
                      className="h-7 text-xs"
                      value={entrevistaForm.entrevistador}
                      onChange={(e) => setEntrevistaForm((f) => ({ ...f, entrevistador: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">Observações</Label>
                    <Textarea
                      className="text-xs min-h-[50px]"
                      value={entrevistaForm.observacoes}
                      onChange={(e) => setEntrevistaForm((f) => ({ ...f, observacoes: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowEntrevistaForm(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleAgendarEntrevista} disabled={savingEntrevista}>
                    <Calendar className="w-3 h-3" />{savingEntrevista ? 'Salvando...' : 'Agendar'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 w-full"
                onClick={() => { setShowEntrevistaForm(true); setResultTarget(null); }}
              >
                <Plus className="w-3 h-3" /> Agendar Nova Entrevista
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEntrevistaOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diárias Dialog ───────────────────────────────────────────── */}
      <Dialog open={diariaOpen} onOpenChange={(o) => { if (!o) setDiariaOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-teal-600" />
              Diárias — {diariaCandidate?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1 space-y-3">

            {/* Summary */}
            {!loadingDiarias && diarias.length > 0 && (
              <div className="rounded-md bg-teal-50 border border-teal-200 px-3 py-2 text-xs text-teal-800 font-medium flex items-center justify-between">
                <span>{diarias.length} diária{diarias.length !== 1 ? 's' : ''} realizada{diarias.length !== 1 ? 's' : ''}</span>
                {diarias.some((d) => d.valor != null) && (
                  <span>
                    Total: R$ {diarias.reduce((acc, d) => acc + (d.valor ?? 0), 0).toFixed(2).replace('.', ',')}
                  </span>
                )}
              </div>
            )}

            {loadingDiarias && (
              <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
            )}
            {!loadingDiarias && diarias.length === 0 && !showDiariaForm && (
              <p className="text-xs text-muted-foreground text-center py-4">
                Nenhuma diária registrada.
              </p>
            )}

            {diarias.map((d) => (
              <div key={d.id} className="rounded-md border p-3 space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium">{formatDate(d.data)}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Entrada: {formatTime(d.horario_entrada)} · Saída: {formatTime(d.horario_saida)}
                      {d.valor != null && ` · R$ ${d.valor.toFixed(2).replace('.', ',')}`}
                    </p>
                    {isAdmin && <p className="text-[10px] text-muted-foreground">Posto: {getPostoNome(d.posto_id)}</p>}
                    {d.observacoes_gerente && (
                      <p className="text-[10px] text-muted-foreground italic mt-1">"{d.observacoes_gerente}"</p>
                    )}
                  </div>
                  <Badge className="text-[10px] bg-teal-600 text-white shrink-0">Diária</Badge>
                </div>
              </div>
            ))}

            {/* Register form */}
            {showDiariaForm ? (
              <div className="rounded-md border border-primary/40 p-3 space-y-3">
                <p className="text-xs font-medium">Registrar Diária</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">Data *</Label>
                    <Input
                      type="date"
                      className="h-7 text-xs"
                      value={diariaForm.data}
                      onChange={(e) => setDiariaForm((f) => ({ ...f, data: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Horário de Entrada *</Label>
                    <Input
                      type="time"
                      className="h-7 text-xs"
                      value={diariaForm.horario_entrada}
                      onChange={(e) => setDiariaForm((f) => ({ ...f, horario_entrada: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px]">Horário de Saída *</Label>
                    <Input
                      type="time"
                      className="h-7 text-xs"
                      value={diariaForm.horario_saida}
                      onChange={(e) => setDiariaForm((f) => ({ ...f, horario_saida: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">Valor da diária (R$) *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="h-7 text-xs"
                      placeholder="0,00"
                      value={diariaForm.valor}
                      onChange={(e) => setDiariaForm((f) => ({ ...f, valor: e.target.value }))}
                    />
                  </div>
                  {isAdmin && (
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px]">Posto *</Label>
                      <Select
                        value={diariaForm.posto_id}
                        onValueChange={(v) => setDiariaForm((f) => ({ ...f, posto_id: v }))}
                      >
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar posto" /></SelectTrigger>
                        <SelectContent>
                          {allPostos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">Observações do gerente sobre o desempenho</Label>
                    <Textarea
                      className="text-xs min-h-[60px]"
                      value={diariaForm.observacoes_gerente}
                      onChange={(e) => setDiariaForm((f) => ({ ...f, observacoes_gerente: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowDiariaForm(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveDiaria} disabled={savingDiaria}>
                    <Save className="w-3 h-3" />{savingDiaria ? 'Salvando...' : 'Registrar'}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 w-full border-teal-300 text-teal-700 hover:bg-teal-50"
                onClick={() => setShowDiariaForm(true)}
              >
                <Plus className="w-3 h-3" /> Registrar Nova Diária
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDiariaOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Contratar Dialog ────────────────────────────────────────── */}
      <Dialog open={contratarOpen} onOpenChange={(o) => { if (!o) setContratarOpen(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-green-600" />
              Contratar — {contratarCandidate?.nome}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            <div className="grid gap-3 py-2">

              {/* Candidate summary */}
              <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs space-y-0.5">
                <div><span className="text-muted-foreground">CPF:</span> {contratarCandidate ? formatCPF(contratarCandidate.cpf) : ''}</div>
                <div><span className="text-muted-foreground">Cargo:</span> {contratarCandidate?.cargo_pretendido}</div>
                {contratarCandidate?.telefone && <div><span className="text-muted-foreground">Telefone:</span> {contratarCandidate.telefone}</div>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Data de Admissão *</Label>
                  <Input type="date" className="h-8 text-xs" value={contratarForm.data_admissao}
                    onChange={(e) => setContratarForm((f) => ({ ...f, data_admissao: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">RG</Label>
                  <Input className="h-8 text-xs" value={contratarForm.rg}
                    onChange={(e) => setContratarForm((f) => ({ ...f, rg: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data de Nascimento</Label>
                  <Input type="date" className="h-8 text-xs" value={contratarForm.data_nascimento}
                    onChange={(e) => setContratarForm((f) => ({ ...f, data_nascimento: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">E-mail</Label>
                  <Input className="h-8 text-xs" value={contratarForm.email}
                    onChange={(e) => setContratarForm((f) => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Observações</Label>
                  <Textarea className="text-xs min-h-[50px]" value={contratarForm.observacoes}
                    onChange={(e) => setContratarForm((f) => ({ ...f, observacoes: e.target.value }))} />
                </div>

                {/* Contrato de Experiência */}
                <div className="col-span-2 border rounded-md p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="contr_em_experiencia"
                      checked={contratarForm.em_experiencia}
                      onCheckedChange={(v) => setContratarForm((f) => ({
                        ...f,
                        em_experiencia: !!v,
                        inicio_experiencia: !!v && !f.inicio_experiencia ? f.data_admissao : f.inicio_experiencia,
                      }))}
                    />
                    <Label htmlFor="contr_em_experiencia" className="text-xs cursor-pointer font-medium">Em contrato de experiência</Label>
                  </div>
                  {contratarForm.em_experiencia && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs">Prazo do contrato *</Label>
                        <Select value={contratarForm.prazo_experiencia} onValueChange={(v) => setContratarForm((f) => ({ ...f, prazo_experiencia: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 dias</SelectItem>
                            <SelectItem value="45">45 dias</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Data de início *</Label>
                        <Input type="date" className="h-8 text-xs" value={contratarForm.inicio_experiencia}
                          onChange={(e) => setContratarForm((f) => ({ ...f, inicio_experiencia: e.target.value }))} />
                      </div>
                      {contratarForm.inicio_experiencia && contratarForm.prazo_experiencia && (
                        <div className="col-span-2 text-xs text-muted-foreground">
                          Vencimento 1º período: <span className="font-medium text-foreground">{formatDate(addDays(contratarForm.inicio_experiencia, Number(contratarForm.prazo_experiencia) - 1))}</span>
                        </div>
                      )}
                      <div className="col-span-2 flex items-center gap-2">
                        <Checkbox
                          id="contr_renovavel"
                          checked={contratarForm.renovavel}
                          onCheckedChange={(v) => setContratarForm((f) => ({ ...f, renovavel: !!v }))}
                        />
                        <Label htmlFor="contr_renovavel" className="text-xs cursor-pointer">Renovável?</Label>
                      </div>
                      {contratarForm.renovavel && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">Prazo da renovação *</Label>
                            <Select value={contratarForm.prazo_renovacao} onValueChange={(v) => setContratarForm((f) => ({ ...f, prazo_renovacao: v }))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="30">30 dias</SelectItem>
                                <SelectItem value="45">45 dias</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {contratarForm.inicio_experiencia && contratarForm.prazo_experiencia && contratarForm.prazo_renovacao && (
                            <div className="flex items-end pb-1">
                              <div className="text-xs text-muted-foreground">
                                Vencimento 2º período: <span className="font-medium text-foreground">{formatDate(addDays(addDays(contratarForm.inicio_experiencia, Number(contratarForm.prazo_experiencia) - 1), Number(contratarForm.prazo_renovacao)))}</span>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Jornada */}
                <div className="col-span-2 border rounded-md p-3 space-y-3 bg-muted/30">
                  <p className="text-xs font-medium">Jornada de Trabalho</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Escala de trabalho</Label>
                      <Select value={contratarForm.escala_trabalho} onValueChange={(v) => setContratarForm((f) => ({ ...f, escala_trabalho: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                        <SelectContent>
                          {escalas.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {contratarForm.escala_trabalho === 'Outros' && (
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Descrição da escala</Label>
                        <Input className="h-8 text-xs" value={contratarForm.escala_outros}
                          onChange={(e) => setContratarForm((f) => ({ ...f, escala_outros: e.target.value }))} />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Entrada</Label>
                      <Input type="time" className="h-8 text-xs" value={contratarForm.horario_entrada}
                        onChange={(e) => setContratarForm((f) => ({ ...f, horario_entrada: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Saída</Label>
                      <Input type="time" className="h-8 text-xs" value={contratarForm.horario_saida}
                        onChange={(e) => setContratarForm((f) => ({ ...f, horario_saida: e.target.value }))} />
                    </div>
                    {(contratarForm.escala_trabalho === '6x1' || contratarForm.escala_trabalho === 'Segunda a Sábado') && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-xs">Entrada sábado</Label>
                          <Input type="time" className="h-8 text-xs" value={contratarForm.horario_sabado_entrada}
                            onChange={(e) => setContratarForm((f) => ({ ...f, horario_sabado_entrada: e.target.value }))} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Saída sábado</Label>
                          <Input type="time" className="h-8 text-xs" value={contratarForm.horario_sabado_saida}
                            onChange={(e) => setContratarForm((f) => ({ ...f, horario_sabado_saida: e.target.value }))} />
                        </div>
                      </>
                    )}
                    <div className="space-y-1">
                      <Label className="text-xs">Intervalo de descanso</Label>
                      <Select value={contratarForm.intervalo_descanso} onValueChange={(v) => setContratarForm((f) => ({ ...f, intervalo_descanso: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Sem intervalo</SelectItem>
                          <SelectItem value="0.5">30 min</SelectItem>
                          <SelectItem value="1">1 hora</SelectItem>
                          <SelectItem value="1.5">1h30</SelectItem>
                          <SelectItem value="2">2 horas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Carga horária semanal (h)</Label>
                      <Input type="number" min="1" max="60" className="h-8 text-xs" value={contratarForm.carga_horaria_semanal}
                        onChange={(e) => setContratarForm((f) => ({ ...f, carga_horaria_semanal: e.target.value }))} />
                    </div>
                    <div className="flex items-end pb-1">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="contr_adicional_noturno"
                          checked={contratarForm.adicional_noturno}
                          onCheckedChange={(v) => setContratarForm((f) => ({ ...f, adicional_noturno: !!v }))}
                        />
                        <Label htmlFor="contr_adicional_noturno" className="text-xs cursor-pointer">Adicional noturno</Label>
                      </div>
                    </div>
                    {contratarForm.escala_trabalho && contratarForm.escala_trabalho !== 'Outros' && contratarForm.horario_entrada && contratarForm.horario_saida && (
                      <div className="col-span-2 bg-background border rounded px-3 py-2 text-xs">
                        <span className="text-muted-foreground">Horas extras fixas mensais estimadas: </span>
                        <span className="font-semibold">
                          {computeHorasExtraFixas(
                            contratarForm.escala_trabalho, contratarForm.horario_entrada, contratarForm.horario_saida,
                            contratarForm.horario_sabado_entrada, contratarForm.horario_sabado_saida,
                            Number(contratarForm.carga_horaria_semanal) || 44,
                            Number(contratarForm.intervalo_descanso) || 1,
                          )}h
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setContratarOpen(false)}>Cancelar</Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleContratar} disabled={savingContratar}>
              <UserPlus className="w-3.5 h-3.5 mr-1" />{savingContratar ? 'Contratando...' : 'Confirmar Contratação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancelar Entrevista Confirm ─────────────────────────────── */}
      <AlertDialog open={!!cancelEntrevistaTarget} onOpenChange={(o) => !o && setCancelEntrevistaTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar entrevista?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelEntrevistaTarget && (
                <>
                  Entrevista de{' '}
                  <strong>{formatDate(cancelEntrevistaTarget.data_entrevista)}</strong>{' '}
                  às {formatTime(cancelEntrevistaTarget.horario)} será marcada como cancelada.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelarEntrevista}>
              Confirmar Cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Confirm ───────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir candidato?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível e removerá todos os dados de <strong>{deleteTarget?.nome}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
