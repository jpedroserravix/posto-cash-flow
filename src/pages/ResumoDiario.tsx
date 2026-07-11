import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Save, Upload, FileText, X, ExternalLink, Paperclip, Gauge, AlertTriangle, Ban, RotateCcw, UserMinus, Camera, Plus, CheckCircle2, Check, MessageSquare, Receipt, ClipboardList, UserPlus, Package } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { openInNewTab } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { useDateFilter } from '@/hooks/useDateFilter';
import { DateFilter } from '@/components/DateFilter';

// ─── types ───────────────────────────────────────────────────────────────────

const CONFERIDO_OPTIONS = ['OK', 'PENDENTE', 'DIVERGÊNCIA'];
const TURNOS_LANCAR = ['Turno 1', 'Turno 2', 'Turno 3', 'Turno 4'];

interface TurnoRow {
  turno: string;
  cofreBrinks: number;
  manual: number;
  pix?: number;
  pixTarifa?: number;
  pixTurnoId?: string;
  pixStatus?: string;
  total: number;
}

interface QualityInfo {
  pdf_path: string | null;
  quality_conferido: string;
}

interface AfericaoInfo {
  id: string;
  pdf_path: string | null;
  criado_por_nome: string | null;
  item_conferido: boolean;
  cancelado: boolean;
  cancelado_por_nome: string | null;
  cancelado_em: string | null;
}

interface Comprovante {
  id: string;
  file_path: string | null;
  file_name: string | null;
  file_type: 'pdf' | 'image' | null;
  observacao: string | null;
  tipo: string | null;
  titulo: string | null;
  descricao_despesa: string | null;
  centro_custo: string | null;
  item_conferido: boolean;
  cancelado: boolean;
  cancelado_por_nome: string | null;
  cancelado_em: string | null;
  funcionario_id: string | null;
  funcionario_nome: string | null;
  ocorrencia_id: string | null;
  valor: number | null;
}

interface FaltaDialogState {
  data: string;
  centroCusto: string;
  tipo: 'Falta de Caixa' | 'Sobra de Caixa';
  funcionarioId: string;
  valor: string;
  observacao: string;
  saving: boolean;
}

interface LancarDialogState {
  data: string;
  centroCusto: string;
  tipo: 'Despesa' | 'Nota a Prazo';
  descricao: string;
  turno: string;
  observacao: string;
  file: File | null;
  saving: boolean;
}

interface GroupData {
  data: string;
  centroCusto: string;
  turnos: TurnoRow[];
  totalBrinks: number;
  totalManual: number;
  totalPix: number;
  totalPixTarifa: number;
  totalGeral: number;
  conferido: string;
  observacao: string;
  resumoId?: string;
  quality?: QualityInfo;
  afericoes: AfericaoInfo[];
  comprovantes: Comprovante[];
  turnosConferidos: string[];
  pixFechamentoId?: string;
  pixBrutoConferido: boolean;
  pixRecebidoBanco: boolean;
}

interface PreviewFile {
  url: string;
  label: string;
  fileType: 'pdf' | 'image';
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ResumoDiario() {
  const { selectedPostoId, nome, perfil } = useAuth();
  const isMobile = useIsMobile();
  const { preset: dfPreset, range: dfRange, setPreset: setDfPreset } = useDateFilter();
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [mesVigentePendencias, setMesVigentePendencias] = useState<{ pendente: number; divergencia: number }>({ pendente: 0, divergencia: 0 });

  // Centro de custo filter (null = todos selecionados)
  const [ccFilter, setCcFilter] = useState<Set<string> | null>(null);
  const allCC = useMemo(() => [...new Set(groups.map((g) => g.centroCusto))].sort(), [groups]);
  const isCCSelected = (cc: string) => ccFilter === null || ccFilter.has(cc);

  const toggleCC = (cc: string) => {
    const current = ccFilter ?? new Set(allCC);
    const next = new Set(current);
    if (next.has(cc)) next.delete(cc); else next.add(cc);
    setCcFilter(next.size === allCC.length ? null : next);
  };

  const displayGroups = useMemo(
    () => (ccFilter === null ? groups : groups.filter((g) => ccFilter.has(g.centroCusto))),
    [groups, ccFilter],
  );

  const datesWithMultipleCC = useMemo(() => {
    const count = new Map<string, number>();
    displayGroups.forEach((g) => count.set(g.data, (count.get(g.data) ?? 0) + 1));
    return new Set([...count.entries()].filter(([, n]) => n > 1).map(([d]) => d));
  }, [displayGroups]);

  // Reset filter when posto changes
  useEffect(() => { setCcFilter(null); }, [selectedPostoId]);

  // Quality PDF state
  const [uploadingQualityDate, setUploadingQualityDate] = useState<string | null>(null);
  const [deletingQualityDate, setDeletingQualityDate] = useState<string | null>(null);
  const qualityFileInputRef = useRef<HTMLInputElement>(null);

  // Comprovantes state
  const [uploadingComprovDate, setUploadingComprovDate] = useState<string | null>(null);
  const comprovantesFileInputRef = useRef<HTMLInputElement>(null);

  // Cancel item (soft delete) state
  const [cancelingItem, setCancelingItem] = useState<{ type: 'comprovante' | 'afericao'; id: string } | null>(null);

  // Falta de caixa state
  const [funcionariosAtivos, setFuncionariosAtivos] = useState<{ id: string; nome: string }[]>([]);
  const [faltaDialog, setFaltaDialog] = useState<FaltaDialogState | null>(null);

  // Lançar item de caixa state
  const [lancarDialog, setLancarDialog] = useState<LancarDialogState | null>(null);
  const lancarCameraRef = useRef<HTMLInputElement>(null);
  const lancarFileRef   = useRef<HTMLInputElement>(null);

  // Comprovante observation edits (keyed by comprovante id, auto-saved)
  const [compObsEdits, setCompObsEdits] = useState<Map<string, string>>(new Map());
  const obsTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Shared preview modal
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // Accordion expanded row key
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Which pill's turno chips are expanded (e.g. "dinheiro-2024-01-10-GERAL")
  const [expandedPill, setExpandedPill] = useState<string | null>(null);

  // Divergência dialog state
  const [divDialog, setDivDialog] = useState<{ data: string; centroCusto: string; obs: string; saving: boolean } | null>(null);

  // Multi-day selection for Pix batch operations
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [confirmBatchReceive, setConfirmBatchReceive] = useState(false);

  const pagination = usePagination(displayGroups, [selectedPostoId, ccFilter], {
    defaultPageSize: 10,
    sessionKey: 'resumo_diario_pageSize',
  });

  useEffect(() => {
    if (selectedPostoId) loadResumo();
  }, [selectedPostoId, dfRange.start, dfRange.end]);

  // Reset pill expansion when accordion row changes
  useEffect(() => { setExpandedPill(null); }, [expandedKey]);

  // Auto-expand most recent entry when groups data changes
  useEffect(() => {
    if (groups.length === 0) return;
    const firstKey = `${groups[0].data}-${groups[0].centroCusto}`;
    setExpandedKey((prev) => {
      if (prev === null) return firstKey;
      const stillExists = groups.some((g) => `${g.data}-${g.centroCusto}` === prev);
      return stillExists ? prev : firstKey;
    });
  }, [groups]);

  useEffect(() => {
    if (selectedPostoId) loadMesVigentePendencias();
  }, [selectedPostoId]);

  useEffect(() => {
    if (selectedPostoId) loadFuncionariosAtivos();
  }, [selectedPostoId]);

  // ─── load ──────────────────────────────────────────────────────────────────

  const loadResumo = async () => {
    if (!selectedPostoId) return;

    const [
      { data: brinks },
      { data: manuais },
      { data: conferencias },
      { data: qualityData },
      { data: comprovantesData },
      { data: afericoesData },
      { data: pixFechData },
    ] = await Promise.all([
      supabase.from('depositos_brinks').select('data_caixa, turno, valor, centro_custo')
        .eq('posto_id', selectedPostoId).not('data_caixa', 'is', null).not('turno', 'is', null)
        .gte('data_caixa', dfRange.start).lte('data_caixa', dfRange.end),
      supabase.from('depositos_manuais').select('data, turno, valor_lancado, centro_custo')
        .eq('posto_id', selectedPostoId).gte('data', dfRange.start).lte('data', dfRange.end),
      supabase.from('resumo_conferencia').select('*')
        .eq('posto_id', selectedPostoId).gte('data', dfRange.start).lte('data', dfRange.end),
      supabase.from('relatorio_quality').select('data_caixa, pdf_path, quality_conferido')
        .eq('posto_id', selectedPostoId).gte('data_caixa', dfRange.start).lte('data_caixa', dfRange.end),
      (supabase as any).from('comprovantes_despesas')
        .select('id, data_caixa, file_path, file_name, file_type, observacao, tipo, titulo, descricao_despesa, item_conferido, centro_custo, cancelado, cancelado_por_nome, cancelado_em, funcionario_id, funcionario_nome, ocorrencia_id, valor')
        .eq('posto_id', selectedPostoId).gte('data_caixa', dfRange.start).lte('data_caixa', dfRange.end),
      (supabase as any).from('afericoes')
        .select('id, data, pdf_path, criado_por_nome, item_conferido, cancelado, cancelado_por_nome, cancelado_em')
        .eq('posto_id', selectedPostoId).gte('data', dfRange.start).lte('data', dfRange.end),
      (supabase as any).from('pix_fechamentos')
        .select('id, data, centro_custo, bruto_conferido, recebido_banco')
        .eq('posto_id', selectedPostoId)
        .gte('data', dfRange.start)
        .lte('data', dfRange.end),
    ]);

    // Segunda query: turnos dos fechamentos Pix (por lista de ids, não por card)
    // pixMap: "data|cc|numero_turno" → { total_calculado, total_tarifa, id, status }
    const pixMap = new Map<string, { total_calculado: number; total_tarifa: number; id: string; status: string }>();
    const pixFechIds = (pixFechData as any[] ?? []).map((f: any) => f.id as string);
    if (pixFechIds.length > 0) {
      const { data: pixTurnosData } = await (supabase as any)
        .from('pix_fechamentos_turnos')
        .select('id, fechamento_id, numero_turno, total_calculado, total_tarifa, status')
        .in('fechamento_id', pixFechIds);

      const fechIdToKey = new Map<string, string>();
      (pixFechData as any[]).forEach((f: any) => fechIdToKey.set(f.id, `${f.data}|${f.centro_custo}`));

      (pixTurnosData as any[] ?? []).forEach((t: any) => {
        const key = fechIdToKey.get(t.fechamento_id);
        if (key) pixMap.set(`${key}|${t.numero_turno}`, {
          total_calculado: Number(t.total_calculado) || 0,
          total_tarifa: Number(t.total_tarifa) || 0,
          id: t.id as string,
          status: t.status as string,
        });
      });
    }

    // pixFechMap: "data|cc" → { id, bruto_conferido, recebido_banco }
    const pixFechMap = new Map<string, { id: string; bruto_conferido: boolean; recebido_banco: boolean }>();
    (pixFechData as any[] ?? []).forEach((f: any) => {
      pixFechMap.set(`${f.data}|${f.centro_custo}`, {
        id: f.id as string,
        bruto_conferido: f.bruto_conferido ?? false,
        recebido_banco:  f.recebido_banco  ?? false,
      });
    });

    // Build turno aggregations
    const turnoMap = new Map<string, { brinks: number; manual: number }>();
    brinks?.forEach((b) => {
      if (!b.data_caixa || !b.turno || !b.centro_custo) return;
      const key = `${b.data_caixa}|${b.centro_custo}|${b.turno}`;
      const ex = turnoMap.get(key) || { brinks: 0, manual: 0 };
      ex.brinks += b.valor;
      turnoMap.set(key, ex);
    });

    manuais?.forEach((m) => {
      if (!m.centro_custo) return;
      const key = `${m.data}|${m.centro_custo}|${m.turno}`;
      const ex = turnoMap.get(key) || { brinks: 0, manual: 0 };
      ex.manual += m.valor_lancado;
      turnoMap.set(key, ex);
    });

    // Group by data|cc
    // parseTurnoNum: extrai o número de turno da string (ex: "1" → 1, "T1" → 1)
    const parseTurnoNum = (t: string): number | null => {
      const n = parseInt(t.replace(/\D/g, ''), 10);
      return isNaN(n) ? null : n;
    };

    const groupMap = new Map<string, TurnoRow[]>();
    turnoMap.forEach((val, key) => {
      const [data, cc, turno] = key.split('|');
      const gKey = `${data}|${cc}`;
      const arr = groupMap.get(gKey) || [];
      const turnoNum = parseTurnoNum(turno);
      const pixEntry = turnoNum !== null ? pixMap.get(`${gKey}|${turnoNum}`) : undefined;
      arr.push({
        turno,
        cofreBrinks: val.brinks,
        manual: val.manual,
        pix: pixEntry?.total_calculado,
        pixTarifa: pixEntry?.total_tarifa,
        pixTurnoId: pixEntry?.id,
        pixStatus: pixEntry?.status,
        total: val.brinks + val.manual,
      });
      groupMap.set(gKey, arr);
    });

    // Conferencia map
    const confMap = new Map<string, { conferido: string; observacao: string; id: string; turnos_conferidos: string[] }>();
    conferencias?.forEach((c) => {
      const cc = c.centro_custo || 'SEM CENTRO';
      const key = `${c.data}|${cc}`;
      const existing = confMap.get(key);
      if (!existing || c.turno === null) {
        confMap.set(key, {
          conferido: c.conferido,
          observacao: c.observacao || '',
          id: c.id,
          turnos_conferidos: (c as any).turnos_conferidos || [],
        });
      }
    });

    // Quality map
    const qualityMap = new Map<string, QualityInfo>();
    qualityData?.forEach((q: any) => {
      qualityMap.set(q.data_caixa, { pdf_path: q.pdf_path ?? null, quality_conferido: q.quality_conferido ?? 'PENDENTE' });
    });

    // Comprovantes map
    const comprovantesMap = new Map<string, Comprovante[]>();
    (comprovantesData as any[] ?? []).forEach((c) => {
      const arr = comprovantesMap.get(c.data_caixa) || [];
      arr.push({ id: c.id, file_path: c.file_path ?? null, file_name: c.file_name ?? null, file_type: c.file_type ?? null, observacao: c.observacao ?? null, tipo: c.tipo ?? null, titulo: c.titulo ?? null, descricao_despesa: c.descricao_despesa ?? null, item_conferido: c.item_conferido ?? false, centro_custo: c.centro_custo ?? null, cancelado: c.cancelado ?? false, cancelado_por_nome: c.cancelado_por_nome ?? null, cancelado_em: c.cancelado_em ?? null, funcionario_id: c.funcionario_id ?? null, funcionario_nome: c.funcionario_nome ?? null, ocorrencia_id: c.ocorrencia_id ?? null, valor: c.valor ?? null });
      comprovantesMap.set(c.data_caixa, arr);
    });

    // Aferições map (by data)
    const afericaoMap = new Map<string, AfericaoInfo[]>();
    (afericoesData as any[] ?? []).forEach((a) => {
      const arr = afericaoMap.get(a.data) || [];
      arr.push({ id: a.id, pdf_path: a.pdf_path ?? null, criado_por_nome: a.criado_por_nome ?? null, item_conferido: a.item_conferido ?? false, cancelado: a.cancelado ?? false, cancelado_por_nome: a.cancelado_por_nome ?? null, cancelado_em: a.cancelado_em ?? null });
      afericaoMap.set(a.data, arr);
    });

    const result: GroupData[] = Array.from(groupMap.entries())
      .map(([key, turnos]) => {
        const [data, centroCusto] = key.split('|');
        const sorted = turnos.sort((a, b) => a.turno.localeCompare(b.turno));
        const totalBrinks    = sorted.reduce((s, t) => s + t.cofreBrinks, 0);
        const totalManual    = sorted.reduce((s, t) => s + t.manual, 0);
        const totalPix       = sorted.reduce((s, t) => s + (t.pix ?? 0), 0);
        const totalPixTarifa = sorted.reduce((s, t) => s + (t.pixTarifa ?? 0), 0);
        const conf    = confMap.get(key);
        const pixFech = pixFechMap.get(key);
        return {
          data,
          centroCusto,
          turnos: sorted,
          totalBrinks,
          totalManual,
          totalPix,
          totalPixTarifa,
          totalGeral: totalBrinks + totalManual,
          conferido: conf?.conferido || 'PENDENTE',
          observacao: conf?.observacao || '',
          resumoId: conf?.id,
          quality: qualityMap.get(data),
          afericoes: afericaoMap.get(data) || [],
          comprovantes: comprovantesMap.get(data) || [],
          turnosConferidos: conf?.turnos_conferidos || [],
          pixFechamentoId:  pixFech?.id,
          pixBrutoConferido: pixFech?.bruto_conferido ?? false,
          pixRecebidoBanco:  pixFech?.recebido_banco  ?? false,
        };
      })
      .sort((a, b) => b.data.localeCompare(a.data) || a.centroCusto.localeCompare(b.centroCusto));

    setGroups(result);
  };

  const loadMesVigentePendencias = async () => {
    if (!selectedPostoId) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().split('T')[0];

    const [{ data: brinks }, { data: manuais }, { data: conferencias }] = await Promise.all([
      supabase.from('depositos_brinks').select('data_caixa, centro_custo')
        .eq('posto_id', selectedPostoId)
        .not('data_caixa', 'is', null).not('centro_custo', 'is', null)
        .gte('data_caixa', start).lte('data_caixa', today),
      supabase.from('depositos_manuais').select('data, centro_custo')
        .eq('posto_id', selectedPostoId)
        .not('centro_custo', 'is', null).gte('data', start).lte('data', today),
      supabase.from('resumo_conferencia').select('data, centro_custo, conferido, turno')
        .eq('posto_id', selectedPostoId).gte('data', start).lte('data', today),
    ]);

    // depositGroups: todos os (data, cc) que têm movimento no período
    const depositGroups = new Set<string>();
    (brinks ?? []).forEach((b: any) => depositGroups.add(`${b.data_caixa}|${b.centro_custo}`));
    (manuais ?? []).forEach((mn: any) => { if (mn.data) depositGroups.add(`${mn.data}|${mn.centro_custo}`); });

    // statusMap: (data, cc) → conferido; linha com turno=null tem preferência (igual ao card)
    const statusMap = new Map<string, string>();
    (conferencias ?? []).forEach((c: any) => {
      const key = `${c.data}|${c.centro_custo ?? 'SEM CENTRO'}`;
      if (!statusMap.has(key) || c.turno === null) statusMap.set(key, c.conferido);
    });

    let pendente = 0, divergencia = 0;
    depositGroups.forEach((key) => {
      const status = statusMap.get(key) ?? 'PENDENTE';
      if (status === 'DIVERGÊNCIA') divergencia++;
      else if (status !== 'OK') pendente++;
    });
    setMesVigentePendencias({ pendente, divergencia });
  };

  const loadFuncionariosAtivos = async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('pessoal_funcionarios')
      .select('id, nome')
      .eq('posto_id', selectedPostoId)
      .eq('status', 'ativo')
      .order('nome');
    setFuncionariosAtivos((data ?? []) as { id: string; nome: string }[]);
  };

  const handleLancarFaltaCaixa = async () => {
    if (!faltaDialog || !selectedPostoId) return;
    const { data: dataCaixa, centroCusto, tipo, funcionarioId, valor, observacao } = faltaDialog;

    if (!funcionarioId) { toast.error('Selecione um funcionário'); return; }
    const valorNum = parseFloat(valor.replace(',', '.'));
    if (!valor || isNaN(valorNum) || valorNum <= 0) { toast.error('Informe um valor válido'); return; }

    setFaltaDialog((prev) => prev ? { ...prev, saving: true } : null);

    const func = funcionariosAtivos.find((f) => f.id === funcionarioId);
    const cc = centroCusto === 'SEM CENTRO' ? null : centroCusto;
    // Falta = valor negativo (desconta); Sobra = positivo (abona)
    const signedValor = tipo === 'Falta de Caixa' ? -valorNum : valorNum;

    // 1. Criar ocorrência em pessoal_ocorrencias (sempre tipo 'Desconto Quebra de Caixa', sinal distingue)
    const { data: ocRec, error: ocErr } = await (supabase as any)
      .from('pessoal_ocorrencias')
      .insert({
        posto_id: selectedPostoId,
        funcionario_id: funcionarioId,
        data: dataCaixa,
        tipo: 'Desconto Quebra de Caixa',
        valor: signedValor,
        descricao: observacao || null,
      })
      .select('id')
      .single();

    if (ocErr) {
      toast.error('Erro ao criar ocorrência');
      setFaltaDialog((prev) => prev ? { ...prev, saving: false } : null);
      return;
    }

    // 2. Criar item no caixa (comprovantes_despesas)
    const { error: compErr } = await (supabase as any)
      .from('comprovantes_despesas')
      .insert({
        posto_id: selectedPostoId,
        data_caixa: dataCaixa,
        centro_custo: cc,
        tipo,
        descricao_despesa: observacao || null,
        funcionario_id: funcionarioId,
        funcionario_nome: func?.nome ?? '',
        ocorrencia_id: ocRec.id,
        valor: signedValor,
      });

    if (compErr) {
      await (supabase as any).from('pessoal_ocorrencias').delete().eq('id', ocRec.id);
      toast.error('Erro ao lançar item de caixa');
      setFaltaDialog((prev) => prev ? { ...prev, saving: false } : null);
      return;
    }

    toast.success('Falta de caixa lançada!');
    setFaltaDialog(null);
    loadResumo();
  };

  const handleLancar = async () => {
    if (!lancarDialog || !selectedPostoId) return;
    const { data: dataCaixa, centroCusto, tipo, descricao, turno, observacao, file } = lancarDialog;

    if (tipo === 'Despesa' && !descricao.trim()) {
      toast.error('Informe a descrição da despesa');
      return;
    }
    if (tipo === 'Nota a Prazo' && !turno) {
      toast.error('Selecione o turno');
      return;
    }

    setLancarDialog((prev) => prev ? { ...prev, saving: true } : null);
    try {
      let filePath: string | null = null;
      let fileName: string | null = null;
      let fileType: string | null = null;

      if (file) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${selectedPostoId}/${dataCaixa}/${Date.now()}-${safe}`;
        const { error: uploadError } = await supabase.storage
          .from('despesas-comprovantes')
          .upload(path, file, { upsert: false, contentType: file.type });
        if (uploadError) throw new Error('Erro ao enviar arquivo: ' + uploadError.message);
        filePath = path;
        fileName = file.name;
        fileType = file.type.startsWith('image/') ? 'image' : 'pdf';
      }

      const cc = centroCusto === 'SEM CENTRO' ? null : centroCusto;
      const payload: Record<string, unknown> = {
        posto_id:     selectedPostoId,
        data_caixa:   dataCaixa,
        centro_custo: cc,
        tipo,
        file_path:    filePath,
        file_name:    fileName,
        file_type:    fileType,
      };

      if (tipo === 'Despesa') {
        payload.descricao_despesa = descricao.trim();
        payload.observacao = observacao.trim() || null;
        if (turno) payload.turno = turno;
      } else {
        payload.turno = turno;
      }

      const { error } = await (supabase as any).from('comprovantes_despesas').insert(payload);
      if (error) throw new Error(error.message);

      toast.success(`${tipo} lançada!`);
      setLancarDialog(null);
      loadResumo();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
      setLancarDialog((prev) => prev ? { ...prev, saving: false } : null);
    }
  };

  // ─── helpers ───────────────────────────────────────────────────────────────

  const getStorageUrl = (bucket: string, path: string) =>
    supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  const fmt = (v: number | null | undefined) =>
    (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const borderColor = (status: string) => {
    if (status === 'OK') return 'border-l-4 border-l-success';
    if (status === 'DIVERGÊNCIA') return 'border-l-4 border-l-destructive';
    return 'border-l-4 border-l-warning';
  };

  const fmtDayLabel = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
    const day = String(d.getDate()).padStart(2, '0');
    return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${day}`;
  };

  const updateGroup = (data: string, cc: string, field: 'conferido' | 'observacao', value: string) => {
    setGroups((prev) => prev.map((g) =>
      g.data === data && g.centroCusto === cc ? { ...g, [field]: value } : g,
    ));
  };

  // ─── turno checkbox toggle ──────────────────────────────────────────────────

  const handleToggleTurno = async (group: GroupData, turno: string) => {
    if (!selectedPostoId) return;
    const isChecked = group.turnosConferidos.includes(turno);
    const newList = isChecked
      ? group.turnosConferidos.filter((t) => t !== turno)
      : [...group.turnosConferidos, turno];

    // Optimistic update
    setGroups((prev) => prev.map((g) =>
      g.data === group.data && g.centroCusto === group.centroCusto
        ? { ...g, turnosConferidos: newList }
        : g,
    ));

    const cc = group.centroCusto === 'SEM CENTRO' ? null : group.centroCusto;

    if (group.resumoId) {
      const { error } = await supabase.from('resumo_conferencia')
        .update({ turnos_conferidos: newList } as any).eq('id', group.resumoId);
      if (error) {
        toast.error('Erro ao salvar conferência');
        setGroups((prev) => prev.map((g) =>
          g.data === group.data && g.centroCusto === group.centroCusto
            ? { ...g, turnosConferidos: group.turnosConferidos }
            : g,
        ));
      }
    } else {
      const { data: newRec, error } = await supabase.from('resumo_conferencia')
        .insert({
          posto_id: selectedPostoId,
          data: group.data,
          turno: null,
          centro_custo: cc,
          conferido: group.conferido,
          observacao: group.observacao || null,
          turnos_conferidos: newList,
        } as any)
        .select('id').single();

      if (error) {
        toast.error('Erro ao salvar conferência');
        setGroups((prev) => prev.map((g) =>
          g.data === group.data && g.centroCusto === group.centroCusto
            ? { ...g, turnosConferidos: group.turnosConferidos }
            : g,
        ));
      } else if (newRec) {
        setGroups((prev) => prev.map((g) =>
          g.data === group.data && g.centroCusto === group.centroCusto
            ? { ...g, resumoId: (newRec as any).id }
            : g,
        ));
      }
    }
  };

  // ─── pix turno checkbox toggle ─────────────────────────────────────────────

  const handleTogglePixTurno = async (group: GroupData, turno: TurnoRow) => {
    if (!turno.pixTurnoId) return;
    const newStatus = turno.pixStatus === 'conferido' ? 'pendente' : 'conferido';

    setGroups((prev) => prev.map((g) =>
      g.data === group.data && g.centroCusto === group.centroCusto
        ? { ...g, turnos: g.turnos.map((t) => t.turno === turno.turno ? { ...t, pixStatus: newStatus } : t) }
        : g,
    ));

    const { error } = await (supabase as any)
      .from('pix_fechamentos_turnos')
      .update({ status: newStatus })
      .eq('id', turno.pixTurnoId);

    if (error) {
      toast.error('Erro ao salvar status Pix');
      setGroups((prev) => prev.map((g) =>
        g.data === group.data && g.centroCusto === group.centroCusto
          ? { ...g, turnos: g.turnos.map((t) => t.turno === turno.turno ? { ...t, pixStatus: turno.pixStatus } : t) }
          : g,
      ));
    }
  };

  // ─── pix fechamento checkboxes ──────────────────────────────────────────────

  const handleTogglePixBruto = async (group: GroupData) => {
    if (!group.pixFechamentoId) return;
    const newVal = !group.pixBrutoConferido;
    setGroups((prev) => prev.map((g) =>
      g.data === group.data && g.centroCusto === group.centroCusto
        ? { ...g, pixBrutoConferido: newVal } : g,
    ));
    const { error } = await (supabase as any)
      .from('pix_fechamentos').update({ bruto_conferido: newVal }).eq('id', group.pixFechamentoId);
    if (error) {
      toast.error('Erro ao salvar');
      setGroups((prev) => prev.map((g) =>
        g.data === group.data && g.centroCusto === group.centroCusto
          ? { ...g, pixBrutoConferido: group.pixBrutoConferido } : g,
      ));
    }
  };

  const handleTogglePixRecebido = async (group: GroupData) => {
    if (!group.pixFechamentoId) return;
    const newVal = !group.pixRecebidoBanco;
    setGroups((prev) => prev.map((g) =>
      g.data === group.data && g.centroCusto === group.centroCusto
        ? { ...g, pixRecebidoBanco: newVal } : g,
    ));
    const { error } = await (supabase as any)
      .from('pix_fechamentos').update({ recebido_banco: newVal }).eq('id', group.pixFechamentoId);
    if (error) {
      toast.error('Erro ao salvar');
      setGroups((prev) => prev.map((g) =>
        g.data === group.data && g.centroCusto === group.centroCusto
          ? { ...g, pixRecebidoBanco: group.pixRecebidoBanco } : g,
      ));
    }
  };

  // ─── save group ────────────────────────────────────────────────────────────

  const handleSaveGroup = async (group: GroupData) => {
    if (!selectedPostoId) return;
    const cc = group.centroCusto === 'SEM CENTRO' ? null : group.centroCusto;
    const payload = {
      posto_id: selectedPostoId,
      data: group.data,
      turno: null as string | null,
      centro_custo: cc,
      conferido: group.conferido,
      observacao: group.observacao || null,
      turnos_conferidos: group.turnosConferidos,
    };

    if (group.resumoId) {
      const { error } = await supabase.from('resumo_conferencia')
        .update({ ...payload } as any).eq('id', group.resumoId);
      if (error) { toast.error('Erro: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('resumo_conferencia').insert(payload as any);
      if (error) { toast.error('Erro: ' + error.message); return; }
    }
    toast.success('Salvo');
    loadResumo();
  };

  // ─── quality PDF handlers ──────────────────────────────────────────────────

  const handleUploadQualityPDF = async (file: File) => {
    if (!uploadingQualityDate || !selectedPostoId) return;
    const path = `${selectedPostoId}/${uploadingQualityDate}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('quality-pdfs').upload(path, file, { upsert: true, contentType: 'application/pdf' });
    if (upErr) { toast.error('Erro ao enviar PDF: ' + upErr.message); return; }
    const { error: dbErr } = await supabase.from('relatorio_quality')
      .upsert({ posto_id: selectedPostoId, data_caixa: uploadingQualityDate, pdf_path: path, quality_conferido: 'PENDENTE' } as any, { onConflict: 'posto_id,data_caixa' });
    if (dbErr) { toast.error('Erro ao salvar: ' + dbErr.message); return; }
    toast.success('PDF importado!');
    setUploadingQualityDate(null);
    loadResumo();
  };

  const handleDeleteQualityPDF = async (data_caixa: string, pdf_path: string) => {
    await supabase.storage.from('quality-pdfs').remove([pdf_path]);
    await supabase.from('relatorio_quality')
      .update({ pdf_path: null, quality_conferido: 'PENDENTE' } as any)
      .eq('posto_id', selectedPostoId!).eq('data_caixa', data_caixa);
    toast.success('PDF removido.');
    setDeletingQualityDate(null);
    loadResumo();
  };

  // ─── comprovantes handlers ─────────────────────────────────────────────────

  const handleUploadComprovantes = async (files: FileList) => {
    if (!uploadingComprovDate || !selectedPostoId) return;
    let ok = 0;
    for (const file of Array.from(files)) {
      const fileType = file.type.startsWith('image/') ? 'image' : 'pdf';
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${selectedPostoId}/${uploadingComprovDate}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('despesas-comprovantes').upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) { toast.error(`Erro ao enviar "${file.name}"`); continue; }
      const { error: dbErr } = await (supabase as any).from('comprovantes_despesas')
        .insert({ posto_id: selectedPostoId, data_caixa: uploadingComprovDate, file_path: path, file_name: file.name, file_type: fileType });
      if (dbErr) { toast.error(`Erro ao salvar "${file.name}"`); continue; }
      ok++;
    }
    if (ok > 0) { toast.success(`${ok} comprovante${ok > 1 ? 's' : ''} anexado${ok > 1 ? 's' : ''}!`); loadResumo(); }
    setUploadingComprovDate(null);
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const handleCancelItem = async () => {
    if (!cancelingItem) return;
    const canceladoPorNome = nome || 'Usuário';
    const canceladoEm = new Date().toISOString();
    const patch = { cancelado: true, cancelado_por_nome: canceladoPorNome, cancelado_em: canceladoEm };

    if (cancelingItem.type === 'comprovante') {
      // Capturar ocorrencia_id antes da atualização otimista
      const comp = groups.flatMap((g) => g.comprovantes).find((c) => c.id === cancelingItem.id);
      const ocorrenciaId = comp?.tipo === 'Falta de Caixa' ? comp.ocorrencia_id : null;

      setGroups((prev) => prev.map((g) => ({ ...g, comprovantes: g.comprovantes.map((c) => c.id === cancelingItem.id ? { ...c, ...patch } : c) })));
      setCancelingItem(null);
      const { error } = await (supabase as any).from('comprovantes_despesas').update(patch).eq('id', cancelingItem.id);
      if (error) {
        toast.error('Erro ao cancelar item');
        setGroups((prev) => prev.map((g) => ({ ...g, comprovantes: g.comprovantes.map((c) => c.id === cancelingItem.id ? { ...c, cancelado: false, cancelado_por_nome: null, cancelado_em: null } : c) })));
      } else if (ocorrenciaId) {
        // Remover ocorrência vinculada (Falta de Caixa)
        await (supabase as any).from('pessoal_ocorrencias').delete().eq('id', ocorrenciaId);
      }
    } else {
      setGroups((prev) => prev.map((g) => ({ ...g, afericoes: g.afericoes.map((a) => a.id === cancelingItem.id ? { ...a, ...patch } : a) })));
      setCancelingItem(null);
      const { error } = await (supabase as any).from('afericoes').update(patch).eq('id', cancelingItem.id);
      if (error) {
        toast.error('Erro ao cancelar aferição');
        setGroups((prev) => prev.map((g) => ({ ...g, afericoes: g.afericoes.map((a) => a.id === cancelingItem.id ? { ...a, cancelado: false, cancelado_por_nome: null, cancelado_em: null } : a) })));
      }
    }
  };

  const handleRestoreItem = async (type: 'comprovante' | 'afericao', id: string) => {
    const patch = { cancelado: false, cancelado_por_nome: null, cancelado_em: null };
    if (type === 'comprovante') {
      setGroups((prev) => prev.map((g) => ({ ...g, comprovantes: g.comprovantes.map((c) => c.id === id ? { ...c, ...patch } : c) })));
      const { error } = await (supabase as any).from('comprovantes_despesas').update(patch).eq('id', id);
      if (error) { toast.error('Erro ao restaurar item'); loadResumo(); }
    } else {
      setGroups((prev) => prev.map((g) => ({ ...g, afericoes: g.afericoes.map((a) => a.id === id ? { ...a, ...patch } : a) })));
      const { error } = await (supabase as any).from('afericoes').update(patch).eq('id', id);
      if (error) { toast.error('Erro ao restaurar aferição'); loadResumo(); }
    }
  };

  // ─── comprovante observation auto-save ─────────────────────────────────────

  const handleCompObsChange = (compId: string, obs: string) => {
    setCompObsEdits((prev) => new Map(prev).set(compId, obs));
    const existing = obsTimersRef.current.get(compId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
      await (supabase as any).from('comprovantes_despesas')
        .update({ observacao: obs || null }).eq('id', compId);
      obsTimersRef.current.delete(compId);
    }, 800);
    obsTimersRef.current.set(compId, timer);
  };

  const getCompObs = (comp: Comprovante) =>
    compObsEdits.has(comp.id) ? (compObsEdits.get(comp.id) ?? '') : (comp.observacao ?? '');

  // ─── checklist counter ─────────────────────────────────────────────────────

  const calcChecklist = (group: GroupData): { feitos: number; total: number } => {
    let feitos = 0, total = 0;
    // Dinheiro por turno
    total += group.turnos.length;
    feitos += group.turnosConferidos.length;
    // Pix — only when fechamento Pix exists
    if (group.pixFechamentoId) {
      const pixTurnos = group.turnos.filter((t) => t.pix !== undefined);
      total += pixTurnos.length + 2; // turno status + bruto + recebido
      feitos += pixTurnos.filter((t) => t.pixStatus === 'conferido').length;
      if (group.pixBrutoConferido) feitos++;
      if (group.pixRecebidoBanco) feitos++;
    }
    // PDF Quality
    total += 1;
    if (group.quality?.pdf_path) feitos++;
    // Itens do caixa
    const afAtivos = group.afericoes.filter((a) => !a.cancelado);
    const visComp = group.comprovantes.filter(
      (c) => !c.cancelado && (c.tipo !== 'Nota a Prazo' || c.centro_custo === group.centroCusto),
    );
    total += afAtivos.length + visComp.length;
    feitos += afAtivos.filter((a) => a.item_conferido).length + visComp.filter((c) => c.item_conferido).length;
    return { feitos, total };
  };

  // ─── status transitions ────────────────────────────────────────────────────

  const handleSetOK = async (group: GroupData) => {
    if (!selectedPostoId) return;
    const cc = group.centroCusto === 'SEM CENTRO' ? null : group.centroCusto;
    setGroups((prev) => prev.map((g) =>
      g.data === group.data && g.centroCusto === group.centroCusto ? { ...g, conferido: 'OK' } : g,
    ));
    if (group.resumoId) {
      const { error } = await supabase.from('resumo_conferencia')
        .update({ conferido: 'OK' } as any).eq('id', group.resumoId);
      if (error) {
        toast.error('Erro ao salvar');
        setGroups((prev) => prev.map((g) => g.data === group.data && g.centroCusto === group.centroCusto ? { ...g, conferido: group.conferido } : g));
        return;
      }
    } else {
      const { data: newRec, error } = await supabase.from('resumo_conferencia')
        .insert({ posto_id: selectedPostoId, data: group.data, turno: null, centro_custo: cc, conferido: 'OK', observacao: group.observacao || null, turnos_conferidos: group.turnosConferidos } as any)
        .select('id').single();
      if (error) {
        toast.error('Erro ao salvar');
        setGroups((prev) => prev.map((g) => g.data === group.data && g.centroCusto === group.centroCusto ? { ...g, conferido: group.conferido } : g));
        return;
      }
      if (newRec) setGroups((prev) => prev.map((g) => g.data === group.data && g.centroCusto === group.centroCusto ? { ...g, resumoId: (newRec as any).id } : g));
    }
    toast.success('Caixa marcado como OK!');
    loadMesVigentePendencias();
  };

  const handleSetPendente = async (group: GroupData) => {
    if (!selectedPostoId) return;
    const cc = group.centroCusto === 'SEM CENTRO' ? null : group.centroCusto;
    setGroups((prev) => prev.map((g) =>
      g.data === group.data && g.centroCusto === group.centroCusto ? { ...g, conferido: 'PENDENTE' } : g,
    ));
    if (group.resumoId) {
      const { error } = await supabase.from('resumo_conferencia')
        .update({ conferido: 'PENDENTE' } as any).eq('id', group.resumoId);
      if (error) {
        toast.error('Erro ao salvar');
        setGroups((prev) => prev.map((g) => g.data === group.data && g.centroCusto === group.centroCusto ? { ...g, conferido: group.conferido } : g));
      }
    } else {
      const { data: newRec, error } = await supabase.from('resumo_conferencia')
        .insert({ posto_id: selectedPostoId, data: group.data, turno: null, centro_custo: cc, conferido: 'PENDENTE', observacao: group.observacao || null, turnos_conferidos: group.turnosConferidos } as any)
        .select('id').single();
      if (!error && newRec) setGroups((prev) => prev.map((g) => g.data === group.data && g.centroCusto === group.centroCusto ? { ...g, resumoId: (newRec as any).id } : g));
    }
    loadMesVigentePendencias();
  };

  const handleSetDivergencia = async () => {
    if (!divDialog || !selectedPostoId) return;
    const { data: dataCaixa, centroCusto, obs } = divDialog;
    if (!obs.trim()) { toast.error('Informe a observação para a divergência'); return; }
    const group = groups.find((g) => g.data === dataCaixa && g.centroCusto === centroCusto);
    if (!group) return;
    const cc = centroCusto === 'SEM CENTRO' ? null : centroCusto;
    setDivDialog((prev) => prev ? { ...prev, saving: true } : null);
    setGroups((prev) => prev.map((g) =>
      g.data === dataCaixa && g.centroCusto === centroCusto ? { ...g, conferido: 'DIVERGÊNCIA', observacao: obs } : g,
    ));
    if (group.resumoId) {
      const { error } = await supabase.from('resumo_conferencia')
        .update({ conferido: 'DIVERGÊNCIA', observacao: obs } as any).eq('id', group.resumoId);
      if (error) { toast.error('Erro ao salvar'); setDivDialog((prev) => prev ? { ...prev, saving: false } : null); return; }
    } else {
      const { data: newRec, error } = await supabase.from('resumo_conferencia')
        .insert({ posto_id: selectedPostoId, data: dataCaixa, turno: null, centro_custo: cc, conferido: 'DIVERGÊNCIA', observacao: obs, turnos_conferidos: group.turnosConferidos } as any)
        .select('id').single();
      if (error) { toast.error('Erro ao salvar'); setDivDialog((prev) => prev ? { ...prev, saving: false } : null); return; }
      if (newRec) setGroups((prev) => prev.map((g) => g.data === dataCaixa && g.centroCusto === centroCusto ? { ...g, resumoId: (newRec as any).id } : g));
    }
    toast.success('Divergência registrada!');
    setDivDialog(null);
    loadMesVigentePendencias();
  };

  // ─── batch mark Pix received ──────────────────────────────────────────────

  const handleBatchMarkReceived = async () => {
    const toUpdate = displayGroups
      .filter((g) => selectedKeys.has(`${g.data}-${g.centroCusto}`) && g.pixFechamentoId)
      .map((g) => g.pixFechamentoId!);

    if (toUpdate.length === 0) {
      toast.error('Nenhum dia selecionado tem fechamento Pix');
      setConfirmBatchReceive(false);
      return;
    }

    const { error } = await (supabase as any)
      .from('pix_fechamentos')
      .update({ recebido_banco: true })
      .in('id', toUpdate);

    if (error) { toast.error('Erro ao atualizar: ' + error.message); setConfirmBatchReceive(false); return; }

    setGroups((prev) => prev.map((g) =>
      selectedKeys.has(`${g.data}-${g.centroCusto}`) && g.pixFechamentoId
        ? { ...g, pixRecebidoBanco: true }
        : g,
    ));

    toast.success(`${toUpdate.length} dia(s) marcados como recebidos no banco!`);
    setSelectedKeys(new Set());
    setConfirmBatchReceive(false);
  };

  // ─── item_conferido toggles ────────────────────────────────────────────────

  const handleToggleComprovante = async (compId: string, currentVal: boolean) => {
    const newVal = !currentVal;
    setGroups((prev) => prev.map((g) => ({ ...g, comprovantes: g.comprovantes.map((c) => c.id === compId ? { ...c, item_conferido: newVal } : c) })));
    const { error } = await (supabase as any).from('comprovantes_despesas').update({ item_conferido: newVal }).eq('id', compId);
    if (error) {
      toast.error('Erro ao salvar');
      setGroups((prev) => prev.map((g) => ({ ...g, comprovantes: g.comprovantes.map((c) => c.id === compId ? { ...c, item_conferido: currentVal } : c) })));
    }
  };

  const handleToggleAfericao = async (afericaoId: string, currentVal: boolean) => {
    const newVal = !currentVal;
    setGroups((prev) => prev.map((g) => ({ ...g, afericoes: g.afericoes.map((a) => a.id === afericaoId ? { ...a, item_conferido: newVal } : a) })));
    const { error } = await (supabase as any).from('afericoes').update({ item_conferido: newVal }).eq('id', afericaoId);
    if (error) {
      toast.error('Erro ao salvar');
      setGroups((prev) => prev.map((g) => ({ ...g, afericoes: g.afericoes.map((a) => a.id === afericaoId ? { ...a, item_conferido: currentVal } : a) })));
    }
  };

  // ─── render ────────────────────────────────────────────────────────────────

  if (!selectedPostoId) {
    return <p className="py-8 text-center text-muted-foreground">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Resumo Diário / CAIXAS</h1>

      {(mesVigentePendencias.pendente > 0 || mesVigentePendencias.divergencia > 0) && (() => {
        const { pendente, divergencia } = mesVigentePendencias;
        const hasDivergencia = divergencia > 0;
        const parts: string[] = [];
        if (pendente > 0) parts.push(`${pendente} ${pendente === 1 ? 'caixa pendente' : 'caixas pendentes'}`);
        if (divergencia > 0) parts.push(`${divergencia} ${divergencia === 1 ? 'caixa com divergência' : 'caixas com divergência'}`);
        return (
          <div className={`flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm ${
            hasDivergencia
              ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300'
              : 'border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-300'
          }`}>
            <AlertTriangle className={`h-4 w-4 shrink-0 ${hasDivergencia ? 'text-red-500 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`} />
            <span>{parts.join(' • ')}</span>
          </div>
        );
      })()}

      <DateFilter preset={dfPreset} range={dfRange} onChange={setDfPreset} />

      {/* Centro de custo filter */}
      {allCC.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Centro de Custo:</span>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
            <Checkbox checked={ccFilter === null} onCheckedChange={() => setCcFilter(null)} />
            Todos
          </label>
          {allCC.map((cc) => (
            <label key={cc} className="flex items-center gap-1.5 cursor-pointer text-xs">
              <Checkbox checked={isCCSelected(cc)} onCheckedChange={() => toggleCC(cc)} />
              {cc}
            </label>
          ))}
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={qualityFileInputRef} type="file" accept=".pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadQualityPDF(f); if (qualityFileInputRef.current) qualityFileInputRef.current.value = ''; }} />
      <input ref={comprovantesFileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple className="hidden"
        onChange={(e) => { if (e.target.files?.length) handleUploadComprovantes(e.target.files); if (comprovantesFileInputRef.current) comprovantesFileInputRef.current.value = ''; }} />

      {displayGroups.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-sm text-muted-foreground">
              {groups.length === 0
                ? 'Nenhum dado para exibir. Importe depósitos Brinks ou cadastre depósitos manuais.'
                : 'Nenhum resultado para os filtros selecionados.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="rounded-md border overflow-hidden">
            {/* Column headers */}
            <div className="flex items-center border-b bg-muted/70 pr-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <div className="w-10 shrink-0" />
              <div className="flex-1">Dia</div>
              <div className="w-24 text-right">Dinheiro</div>
              <div className="w-24 text-right">Pix</div>
              <div className="hidden sm:block w-24 text-right">Líquido Pix</div>
              <div className="w-20 text-center">Status</div>
            </div>

            {pagination.paginatedData.map((group, idx) => {
              const rowKey = `${group.data}-${group.centroCusto}`;
              const isExpanded = expandedKey === rowKey;
              const pdfUrl = group.quality?.pdf_path
                ? getStorageUrl('quality-pdfs', group.quality.pdf_path)
                : null;
              const dateLabel = new Date(`${group.data}T00:00:00`).toLocaleDateString('pt-BR');
              const visibleComprovantes = group.comprovantes.filter(
                (c) => c.tipo !== 'Nota a Prazo' || c.centro_custo === group.centroCusto
              );
              const totalItens = group.afericoes.filter((a) => !a.cancelado).length
                + visibleComprovantes.filter((c) => !c.cancelado).length;
              const liquidoPix = group.totalPix > 0 ? group.totalPix - group.totalPixTarifa : null;
              const isLast = idx === pagination.paginatedData.length - 1;

              return (
                <div key={rowKey} className={!isLast ? 'border-b' : ''}>
                  {/* Closed row: checkbox + accordion trigger */}
                  <div className={`flex items-center transition-colors hover:bg-muted/30 ${isExpanded ? 'bg-muted/20' : ''}`}>
                    {/* Selection checkbox — stopPropagation prevents accordion toggle */}
                    <div
                      className="w-10 shrink-0 flex items-center justify-center py-2.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selectedKeys.has(rowKey)}
                        onCheckedChange={() => setSelectedKeys((prev) => {
                          const next = new Set(prev);
                          if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
                          return next;
                        })}
                        className="h-4 w-4"
                      />
                    </div>
                    <button
                      className="flex-1 flex items-center py-2.5 pr-3 text-left"
                      onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium tabular-nums text-sm">{fmtDayLabel(group.data)}</span>
                        {datesWithMultipleCC.has(group.data) && (
                          <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">{group.centroCusto}</span>
                        )}
                      </div>
                      <div className="w-24 text-right tabular-nums text-xs">{fmt(group.totalGeral)}</div>
                      <div className="w-24 text-right tabular-nums text-xs text-primary">
                        {group.totalPix > 0 ? fmt(group.totalPix) : <span className="text-muted-foreground">—</span>}
                      </div>
                      <div className="hidden sm:block w-24 text-right tabular-nums text-xs">
                        {liquidoPix !== null ? fmt(liquidoPix) : <span className="text-muted-foreground">—</span>}
                      </div>
                      <div className="w-20 flex justify-center">
                        {group.conferido === 'OK' ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
                        ) : group.conferido === 'DIVERGÊNCIA' ? (
                          <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">difere</span>
                        ) : (() => {
                          const { feitos, total } = calcChecklist(group);
                          return <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-500">{feitos}/{total}</span>;
                        })()}
                      </div>
                    </button>
                  </div>

                  {/* Expanded detail — R2 */}
                  {isExpanded && (
                    <div className="border-t bg-muted/50 p-4 space-y-3">

                      {/* Expansion header: date label + "+" dropdown */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{dateLabel} — {group.centroCusto}</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <Plus className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {perfil !== 'frentista' && (
                              <DropdownMenuItem onClick={() => setLancarDialog({ data: group.data, centroCusto: group.centroCusto, tipo: 'Despesa', descricao: '', turno: '', observacao: '', file: null, saving: false })}>
                                <Receipt className="mr-2 h-4 w-4" />Lançar item
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setFaltaDialog({ data: group.data, centroCusto: group.centroCusto, tipo: 'Falta de Caixa', funcionarioId: '', valor: '', observacao: '', saving: false })}>
                              <UserMinus className="mr-2 h-4 w-4" />Falta de Caixa
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setUploadingComprovDate(group.data); comprovantesFileInputRef.current?.click(); }}>
                              <Upload className="mr-2 h-4 w-4" />Adicionar comprovante
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => { setUploadingQualityDate(group.data); qualityFileInputRef.current?.click(); }}>
                              <FileText className="mr-2 h-4 w-4" />{pdfUrl ? 'Substituir PDF Quality' : 'Importar PDF Quality'}
                            </DropdownMenuItem>
                            {pdfUrl && (
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeletingQualityDate(group.data)}>
                                <X className="mr-2 h-4 w-4" />Remover PDF Quality
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {group.conferido === 'DIVERGÊNCIA' ? (
                              <DropdownMenuItem onClick={() => handleSetPendente(group)}>
                                <RotateCcw className="mr-2 h-4 w-4" />Voltar para Pendente
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDivDialog({ data: group.data, centroCusto: group.centroCusto, obs: group.observacao, saving: false })}>
                                <AlertTriangle className="mr-2 h-4 w-4" />Marcar divergência
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Two-column grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                        {/* Left: compact turnos table (no checkboxes) */}
                        <div className="space-y-2">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs h-7 py-0">Turno</TableHead>
                                <TableHead className="text-right text-xs h-7 py-0">Brinks</TableHead>
                                <TableHead className="text-right text-xs h-7 py-0">Manual</TableHead>
                                <TableHead className="text-right text-xs h-7 py-0">Dinheiro</TableHead>
                                <TableHead className="text-right text-xs h-7 py-0 text-primary">Pix</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.turnos.map((turno) => (
                                <TableRow key={turno.turno} className="bg-muted/30">
                                  <TableCell className="py-1 text-xs text-muted-foreground">{turno.turno}</TableCell>
                                  <TableCell className="py-1 text-right text-xs">{fmt(turno.cofreBrinks)}</TableCell>
                                  <TableCell className="py-1 text-right text-xs">{fmt(turno.manual)}</TableCell>
                                  <TableCell className="py-1 text-right text-xs font-medium">{fmt(turno.total)}</TableCell>
                                  <TableCell className="py-1 text-right text-xs text-primary">
                                    {turno.pix !== undefined ? fmt(turno.pix) : '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="border-t-2 font-semibold">
                                <TableCell className="py-1 text-xs">Total</TableCell>
                                <TableCell className="py-1 text-right text-xs">{fmt(group.totalBrinks)}</TableCell>
                                <TableCell className="py-1 text-right text-xs">{fmt(group.totalManual)}</TableCell>
                                <TableCell className="py-1 text-right text-xs">{fmt(group.totalGeral)}</TableCell>
                                <TableCell className="py-1 text-right text-xs text-primary">
                                  {group.totalPix > 0 ? fmt(group.totalPix) : '—'}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                          {group.totalPix > 0 && (
                            <p className="text-[11px] text-muted-foreground border-t pt-1.5">
                              Líquido Pix a receber{' '}
                              <span className="font-medium text-foreground">{fmt(group.totalPix - group.totalPixTarifa)}</span>
                              {group.totalPixTarifa > 0 && (
                                <> · tarifas <span className="font-medium">{fmt(group.totalPixTarifa)}</span></>
                              )}
                            </p>
                          )}
                        </div>

                        {/* Right: compact itens do caixa */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Itens do Caixa</p>

                          {group.afericoes.length === 0 && visibleComprovantes.length === 0 && (
                            <p className="text-xs text-muted-foreground py-2">Nenhum item de caixa.</p>
                          )}

                          {group.afericoes.map((af) => {
                            const afUrl = af.pdf_path ? getStorageUrl('despesas-comprovantes', af.pdf_path) : null;
                            return (
                              <div key={af.id} className={`group/af flex items-center gap-2 rounded-md border p-2 ${af.cancelado ? 'bg-muted/40 opacity-70' : ''}`}>
                                <Gauge className={`h-4 w-4 shrink-0 ${af.cancelado ? 'text-muted-foreground' : 'text-blue-500'}`} />
                                <div className="flex-1 min-w-0">
                                  <span className={`text-xs ${af.cancelado ? 'line-through text-muted-foreground' : ''}`}>
                                    Aferição de Bicos{af.criado_por_nome ? ` — ${af.criado_por_nome}` : ''}
                                  </span>
                                  {af.cancelado && af.cancelado_por_nome && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      Cancelado por {af.cancelado_por_nome} em {formatDateTime(af.cancelado_em)}
                                    </p>
                                  )}
                                </div>
                                {afUrl && !af.cancelado && (
                                  <HoverCard openDelay={300} closeDelay={100}>
                                    <HoverCardTrigger asChild>
                                      <button
                                        className="flex items-center rounded border border-border px-1.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                                        onClick={() => {
                                          if (isMobile) { openInNewTab(afUrl); return; }
                                          setPreviewFile({ url: afUrl, label: `Aferição de Bicos — ${dateLabel}`, fileType: 'pdf' });
                                        }}
                                      >
                                        <Paperclip className="h-3.5 w-3.5" />
                                      </button>
                                    </HoverCardTrigger>
                                    <HoverCardContent className="w-80 p-1.5" align="start" side="bottom">
                                      {af.criado_por_nome && (
                                        <p className="mb-1 px-0.5 text-[10px] text-muted-foreground">Por: {af.criado_por_nome}</p>
                                      )}
                                      <p className="mb-1 px-0.5 text-[10px] text-muted-foreground">Clique para abrir com zoom</p>
                                      <iframe src={afUrl} className="h-52 w-full rounded border border-border" title="Aferição de Bicos" />
                                    </HoverCardContent>
                                  </HoverCard>
                                )}
                                {!af.cancelado && (
                                  <Checkbox
                                    checked={af.item_conferido}
                                    onCheckedChange={() => handleToggleAfericao(af.id, af.item_conferido)}
                                    className="h-4 w-4 shrink-0"
                                  />
                                )}
                                {af.cancelado ? (
                                  <button
                                    className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                                    title="Restaurar"
                                    onClick={() => handleRestoreItem('afericao', af.id)}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <button
                                    className="opacity-0 group-hover/af:opacity-100 transition-opacity shrink-0 flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                                    title="Cancelar aferição"
                                    onClick={() => setCancelingItem({ type: 'afericao', id: af.id })}
                                  >
                                    <Ban className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          {visibleComprovantes.map((comp) => {
                            const compUrl = comp.file_path ? getStorageUrl('despesas-comprovantes', comp.file_path) : null;
                            const compLabel = comp.tipo === 'Despesa'
                              ? `Despesa${comp.descricao_despesa ? ` — ${comp.descricao_despesa}` : ''}`
                              : comp.tipo === 'Outros'
                                ? `Outros${comp.titulo ? ` — ${comp.titulo}` : ''}`
                                : comp.tipo === 'Nota a Prazo'
                                  ? 'Nota a Prazo'
                                  : comp.tipo === 'Falta de Caixa'
                                    ? `Falta de Caixa${comp.funcionario_nome ? ` — ${comp.funcionario_nome}` : ''}${comp.valor != null ? ` — ${fmt(comp.valor)}` : ''}`
                                    : comp.tipo === 'Sobra de Caixa'
                                      ? `Sobra de Caixa${comp.funcionario_nome ? ` — ${comp.funcionario_nome}` : ''}${comp.valor != null ? ` — +${fmt(comp.valor)}` : ''}`
                                      : comp.file_name ?? '(arquivo)';
                            const compIcon = comp.tipo === 'Despesa' ? <Receipt className="h-4 w-4 shrink-0 text-orange-500" />
                              : comp.tipo === 'Falta de Caixa' ? <UserMinus className="h-4 w-4 shrink-0 text-red-500" />
                              : comp.tipo === 'Sobra de Caixa' ? <UserPlus className="h-4 w-4 shrink-0 text-green-500" />
                              : comp.tipo === 'Nota a Prazo' ? <ClipboardList className="h-4 w-4 shrink-0 text-purple-500" />
                              : comp.tipo === 'Outros' ? <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                              : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
                            return (
                              <div key={comp.id} className={`group/comp flex items-center gap-2 rounded-md border p-2 ${comp.cancelado ? 'bg-muted/40 opacity-70' : ''}`}>
                                <span className={comp.cancelado ? 'opacity-50' : ''}>{compIcon}</span>
                                <span className={`flex-1 min-w-0 text-xs truncate ${
                                  comp.cancelado ? 'line-through text-muted-foreground' :
                                  comp.tipo === 'Falta de Caixa' ? 'text-red-600 dark:text-red-400 font-medium' :
                                  comp.tipo === 'Sobra de Caixa' ? 'text-green-600 dark:text-green-400 font-medium' : ''
                                }`}>{compLabel}</span>
                                {compUrl && !comp.cancelado && (
                                  <HoverCard openDelay={300} closeDelay={100}>
                                    <HoverCardTrigger asChild>
                                      <button
                                        className="flex items-center rounded border border-border px-1.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                                        onClick={() => {
                                          if (comp.file_type !== 'image' && isMobile) { openInNewTab(compUrl); return; }
                                          setPreviewFile({ url: compUrl, label: comp.file_name ?? compLabel, fileType: comp.file_type ?? 'pdf' });
                                        }}
                                      >
                                        <Paperclip className="h-3.5 w-3.5" />
                                      </button>
                                    </HoverCardTrigger>
                                    <HoverCardContent className="w-64 p-1.5" align="start" side="bottom">
                                      {comp.file_type === 'image' ? (
                                        <img src={compUrl} className="w-full max-h-48 rounded border object-contain" alt={comp.file_name ?? ''} />
                                      ) : (
                                        <>
                                          <p className="mb-1 px-0.5 text-[10px] text-muted-foreground">Clique para abrir com zoom</p>
                                          <iframe src={compUrl} className="h-40 w-full rounded border border-border" title={comp.file_name ?? ''} />
                                        </>
                                      )}
                                    </HoverCardContent>
                                  </HoverCard>
                                )}
                                {!comp.cancelado && (
                                  <Checkbox
                                    checked={comp.item_conferido}
                                    onCheckedChange={() => handleToggleComprovante(comp.id, comp.item_conferido)}
                                    className="h-4 w-4 shrink-0"
                                  />
                                )}
                                {comp.cancelado ? (
                                  <button
                                    className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                                    title="Restaurar"
                                    onClick={() => handleRestoreItem('comprovante', comp.id)}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </button>
                                ) : (
                                  <button
                                    className="opacity-0 group-hover/comp:opacity-100 transition-opacity shrink-0 flex h-5 w-5 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                                    onClick={() => setCancelingItem({ type: 'comprovante', id: comp.id })}
                                    title="Cancelar item"
                                  >
                                    <Ban className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── Footer: pills + obs icon + status + save ── */}
                      <div className="pt-2 border-t">
                        <div className="flex flex-wrap items-start gap-1.5">

                          {/* Dinheiro pill with expandable T1/T2/T3 */}
                          <div>
                            <button
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                group.turnosConferidos.length === group.turnos.length && group.turnos.length > 0
                                  ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'border-border text-muted-foreground'
                              }`}
                              onClick={() => setExpandedPill((p) => p === `${rowKey}-din` ? null : `${rowKey}-din`)}
                            >
                              {group.turnosConferidos.length === group.turnos.length && group.turnos.length > 0 && (
                                <Check className="h-3 w-3" />
                              )}
                              Dinheiro {group.turnosConferidos.length}/{group.turnos.length}
                            </button>
                            {expandedPill === `${rowKey}-din` && (
                              <div className="mt-1 flex gap-1 flex-wrap">
                                {group.turnos.map((turno) => {
                                  const checked = group.turnosConferidos.includes(turno.turno);
                                  return (
                                    <button
                                      key={turno.turno}
                                      className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                        checked ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'border-border text-muted-foreground'
                                      }`}
                                      onClick={() => handleToggleTurno(group, turno.turno)}
                                    >
                                      {checked && <Check className="h-2.5 w-2.5" />}{turno.turno}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Pix pill with expandable T1/T2/T3 */}
                          {group.totalPix > 0 && (() => {
                            const pixConf = group.turnos.filter((t) => t.pixStatus === 'conferido').length;
                            const pixTotal = group.turnos.filter((t) => t.pix !== undefined).length;
                            return (
                              <div>
                                <button
                                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    pixConf === pixTotal && pixTotal > 0
                                      ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                      : 'border-border text-muted-foreground'
                                  }`}
                                  onClick={() => setExpandedPill((p) => p === `${rowKey}-pix` ? null : `${rowKey}-pix`)}
                                >
                                  {pixConf === pixTotal && pixTotal > 0 && <Check className="h-3 w-3" />}
                                  Pix {pixConf}/{pixTotal}
                                </button>
                                {expandedPill === `${rowKey}-pix` && (
                                  <div className="mt-1 flex gap-1 flex-wrap">
                                    {group.turnos.filter((t) => t.pix !== undefined).map((turno) => {
                                      const checked = turno.pixStatus === 'conferido';
                                      return (
                                        <button
                                          key={turno.turno}
                                          className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                                            checked ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'border-border text-muted-foreground'
                                          } ${!turno.pixTurnoId ? 'opacity-50 cursor-not-allowed' : ''}`}
                                          disabled={!turno.pixTurnoId}
                                          onClick={() => handleTogglePixTurno(group, turno)}
                                        >
                                          {checked && <Check className="h-2.5 w-2.5" />}{turno.turno}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Pix bruto pill */}
                          {group.totalPix > 0 && (
                            <button
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                group.pixBrutoConferido
                                  ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'border-border text-muted-foreground'
                              } ${!group.pixFechamentoId || group.totalPix === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                              disabled={!group.pixFechamentoId || group.totalPix === 0}
                              onClick={() => handleTogglePixBruto(group)}
                            >
                              {group.pixBrutoConferido && <Check className="h-3 w-3" />}
                              Pix bruto
                            </button>
                          )}

                          {/* Recebido no banco pill */}
                          {group.totalPix > 0 && (
                            <button
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                group.pixRecebidoBanco
                                  ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'border-border text-muted-foreground'
                              } ${!group.pixFechamentoId ? 'opacity-50 cursor-not-allowed' : ''}`}
                              disabled={!group.pixFechamentoId}
                              onClick={() => handleTogglePixRecebido(group)}
                            >
                              {group.pixRecebidoBanco && <Check className="h-3 w-3" />}
                              Recebido no banco
                            </button>
                          )}

                          {/* PDF Quality pill */}
                          {pdfUrl ? (
                            <HoverCard openDelay={300} closeDelay={100}>
                              <HoverCardTrigger asChild>
                                <button
                                  className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-400 transition-colors"
                                  onClick={() => {
                                    if (isMobile) { openInNewTab(pdfUrl); return; }
                                    setPreviewFile({ url: pdfUrl, label: `PDF Quality — ${dateLabel}`, fileType: 'pdf' });
                                  }}
                                >
                                  <Check className="h-3 w-3" />PDF Quality
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80 p-1.5" align="start" side="top">
                                <p className="mb-1 px-0.5 text-[10px] text-muted-foreground">Clique para abrir com zoom</p>
                                <iframe src={pdfUrl} className="h-52 w-full rounded border border-border" title="Preview PDF Quality" />
                              </HoverCardContent>
                            </HoverCard>
                          ) : (
                            <button
                              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium border-border text-muted-foreground transition-colors"
                              onClick={() => { setUploadingQualityDate(group.data); qualityFileInputRef.current?.click(); }}
                            >
                              PDF Quality
                            </button>
                          )}

                          {/* Itens pill */}
                          {totalItens > 0 && (() => {
                            const conferidos = [
                              ...group.afericoes.filter((a) => !a.cancelado && a.item_conferido),
                              ...visibleComprovantes.filter((c) => !c.cancelado && c.item_conferido),
                            ].length;
                            const ativos = [
                              ...group.afericoes.filter((a) => !a.cancelado),
                              ...visibleComprovantes.filter((c) => !c.cancelado),
                            ].length;
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                                conferidos === ativos
                                  ? 'bg-green-100 border-green-500 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'border-border text-muted-foreground'
                              }`}>
                                {conferidos === ativos && <Check className="h-3 w-3" />}
                                Itens {conferidos}/{ativos}
                              </span>
                            );
                          })()}

                          {/* Right side: obs icon + status widget */}
                          <div className="ml-auto flex items-center gap-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  title={group.observacao ? group.observacao : 'Observação geral'}
                                  className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                                    group.observacao
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                                  }`}
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-3" align="end" side="top">
                                <p className="text-xs font-medium mb-2">Observação geral do caixa</p>
                                <Textarea
                                  className="text-xs min-h-[60px] resize-none"
                                  value={group.observacao}
                                  onChange={(e) => updateGroup(group.data, group.centroCusto, 'observacao', e.target.value)}
                                  placeholder="Observação..."
                                />
                                <Button size="sm" className="mt-2 w-full h-7 text-xs" onClick={() => handleSaveGroup(group)}>
                                  <Save className="mr-1.5 h-3 w-3" />Salvar
                                </Button>
                              </PopoverContent>
                            </Popover>

                            {(() => {
                              const { feitos, total } = calcChecklist(group);
                              if (group.conferido === 'DIVERGÊNCIA') {
                                return (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-red-400 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                    <AlertTriangle className="h-3 w-3" />Divergência
                                  </span>
                                );
                              }
                              if (group.conferido === 'OK') {
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-green-500 bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                      <CheckCircle2 className="h-3 w-3" />Conferido
                                    </span>
                                    <button
                                      className="text-[10px] text-muted-foreground underline-offset-2 hover:underline hover:text-foreground"
                                      onClick={() => handleSetPendente(group)}
                                    >
                                      Reabrir
                                    </button>
                                  </div>
                                );
                              }
                              if (feitos === total) {
                                return (
                                  <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => handleSetOK(group)}>
                                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Marcar caixa OK
                                  </Button>
                                );
                              }
                              return (
                                <span className="inline-flex items-center gap-1 rounded-full border border-yellow-400 bg-yellow-50 px-2.5 py-1 text-[11px] font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                  Pendente · {feitos} de {total}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Multi-day Pix selection bar ── */}
          {selectedKeys.size > 0 && (() => {
            const sel = displayGroups.filter((g) => selectedKeys.has(`${g.data}-${g.centroCusto}`));
            const pixBruto = sel.reduce((s, g) => s + g.totalPix, 0);
            const pixTarifa = sel.reduce((s, g) => s + g.totalPixTarifa, 0);
            const liquidoPixSel = pixBruto - pixTarifa;
            const semFechamento = sel.filter((g) => !g.pixFechamentoId).length;
            return (
              <div className="sticky bottom-2 z-20 rounded-md border bg-background shadow-lg px-4 py-3 flex flex-wrap items-center gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-medium">
                    {selectedKeys.size} {selectedKeys.size === 1 ? 'dia selecionado' : 'dias selecionados'}
                    {' · '}Pix bruto{' '}
                    <span className="font-semibold">{fmt(pixBruto)}</span>
                    {' · '}Líquido a receber{' '}
                    <span className="font-semibold text-primary">{fmt(liquidoPixSel)}</span>
                  </span>
                  {semFechamento > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {semFechamento} dia(s) sem fechamento Pix — somados como zero
                    </span>
                  )}
                </div>
                <div className="ml-auto flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setSelectedKeys(new Set())}>
                    Limpar seleção
                  </Button>
                  <Button size="sm" onClick={() => setConfirmBatchReceive(true)}>
                    Marcar recebido no banco
                  </Button>
                </div>
              </div>
            );
          })()}

          <PaginationControls
            page={pagination.page} totalPages={pagination.totalPages}
            pageSize={pagination.pageSize} totalItems={pagination.totalItems}
            startIndex={pagination.startIndex} endIndex={pagination.endIndex}
            onPageChange={pagination.setPage} onPageSizeChange={pagination.handlePageSizeChange}
            pageSizeOptions={[10, 20, 50]} itemLabel="caixas"
          />
        </>
      )}

      {/* ── Lançar Item de Caixa (Despesa / Nota a Prazo) ── */}
      <Dialog open={lancarDialog !== null} onOpenChange={(o) => { if (!o && !lancarDialog?.saving) setLancarDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lançar Item de Caixa</DialogTitle>
          </DialogHeader>
          {lancarDialog && (
            <>
              <p className="text-xs text-muted-foreground -mt-2">
                {new Date(`${lancarDialog.data}T00:00:00`).toLocaleDateString('pt-BR')} — {lancarDialog.centroCusto}
              </p>

              {/* Tipo toggle */}
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${lancarDialog.tipo === 'Despesa' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setLancarDialog((prev) => prev ? { ...prev, tipo: 'Despesa', descricao: '', turno: '', observacao: '', file: null } : null)}
                >
                  Despesa
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors border-l ${lancarDialog.tipo === 'Nota a Prazo' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                  onClick={() => setLancarDialog((prev) => prev ? { ...prev, tipo: 'Nota a Prazo', descricao: '', turno: '', observacao: '', file: null } : null)}
                >
                  Nota a Prazo
                </button>
              </div>

              <div className="space-y-3">
                {/* Descrição — Despesa */}
                {lancarDialog.tipo === 'Despesa' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição *</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="Ex: Gás, material de limpeza..."
                      value={lancarDialog.descricao}
                      onChange={(e) => setLancarDialog((prev) => prev ? { ...prev, descricao: e.target.value } : null)}
                    />
                  </div>
                )}

                {/* Turno — Nota a Prazo */}
                {lancarDialog.tipo === 'Nota a Prazo' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Turno *</Label>
                    <Select
                      value={lancarDialog.turno || undefined}
                      onValueChange={(v) => setLancarDialog((prev) => prev ? { ...prev, turno: v } : null)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione o turno" />
                      </SelectTrigger>
                      <SelectContent>
                        {TURNOS_LANCAR.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Observação — Despesa */}
                {lancarDialog.tipo === 'Despesa' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Observação</Label>
                    <Textarea
                      className="text-xs min-h-[60px] resize-none"
                      placeholder="Observações adicionais..."
                      value={lancarDialog.observacao}
                      onChange={(e) => setLancarDialog((prev) => prev ? { ...prev, observacao: e.target.value } : null)}
                    />
                  </div>
                )}

                {/* Foto / Arquivo (opcional) */}
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Foto / Arquivo{' '}
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </Label>
                  {lancarDialog.file ? (
                    <div className="flex items-center gap-2 rounded-md border p-2">
                      {lancarDialog.file.type.startsWith('image/') ? (
                        <img
                          src={URL.createObjectURL(lancarDialog.file)}
                          className="h-10 w-10 rounded object-cover shrink-0"
                          alt=""
                        />
                      ) : (
                        <FileText className="h-6 w-6 text-red-500 shrink-0" />
                      )}
                      <p className="text-xs flex-1 min-w-0 truncate">{lancarDialog.file.name}</p>
                      <button
                        onClick={() => setLancarDialog((prev) => prev ? { ...prev, file: null } : null)}
                        className="shrink-0 rounded-full p-1 hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-14 flex-col gap-1 text-xs"
                        onClick={() => lancarCameraRef.current?.click()}
                      >
                        <Camera className="h-5 w-5" />
                        Câmera
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-14 flex-col gap-1 text-xs"
                        onClick={() => lancarFileRef.current?.click()}
                      >
                        <Paperclip className="h-5 w-5" />
                        Arquivo
                      </Button>
                    </div>
                  )}
                  <input
                    ref={lancarCameraRef}
                    type="file"
                    accept="image/*"
                    {...({ capture: 'environment' } as any)}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setLancarDialog((prev) => prev ? { ...prev, file: f } : null);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={lancarFileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setLancarDialog((prev) => prev ? { ...prev, file: f } : null);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" disabled={lancarDialog.saving} onClick={() => setLancarDialog(null)}>
                  Cancelar
                </Button>
                <Button size="sm" disabled={lancarDialog.saving} onClick={handleLancar}>
                  {lancarDialog.saving ? 'Salvando...' : 'Lançar'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Lançar Falta de Caixa ── */}
      <Dialog open={faltaDialog !== null} onOpenChange={(o) => { if (!o) setFaltaDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Lançar Falta de Caixa</DialogTitle>
          </DialogHeader>
          {faltaDialog && (
            <p className="text-xs text-muted-foreground -mt-2">
              {new Date(`${faltaDialog.data}T00:00:00`).toLocaleDateString('pt-BR')} — {faltaDialog.centroCusto}
            </p>
          )}
          <div className="space-y-3 py-1">
            <div className="flex rounded-md border overflow-hidden">
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${faltaDialog?.tipo === 'Falta de Caixa' ? 'bg-red-500 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                onClick={() => setFaltaDialog((prev) => prev ? { ...prev, tipo: 'Falta de Caixa' } : null)}
              >
                Falta
              </button>
              <button
                type="button"
                className={`flex-1 py-1.5 text-xs font-medium transition-colors border-l ${faltaDialog?.tipo === 'Sobra de Caixa' ? 'bg-green-600 text-white' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                onClick={() => setFaltaDialog((prev) => prev ? { ...prev, tipo: 'Sobra de Caixa' } : null)}
              >
                Sobra
              </button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Funcionário *</Label>
              <Select
                value={faltaDialog?.funcionarioId || undefined}
                onValueChange={(v) => setFaltaDialog((prev) => prev ? { ...prev, funcionarioId: v } : null)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione o funcionário..." />
                </SelectTrigger>
                <SelectContent>
                  {funcionariosAtivos.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor (R$) *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="0,00"
                value={faltaDialog?.valor ?? ''}
                onChange={(e) => setFaltaDialog((prev) => prev ? { ...prev, valor: e.target.value } : null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observação</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Opcional..."
                value={faltaDialog?.observacao ?? ''}
                onChange={(e) => setFaltaDialog((prev) => prev ? { ...prev, observacao: e.target.value } : null)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setFaltaDialog(null)}>Cancelar</Button>
            <Button size="sm" disabled={faltaDialog?.saving} onClick={handleLancarFaltaCaixa}>
              {faltaDialog?.saving ? 'Salvando...' : 'Lançar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Preview modal ── */}
      <Dialog open={previewFile !== null} onOpenChange={(open) => { if (!open) setPreviewFile(null); }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="flex-row items-center justify-between px-4 py-2 border-b shrink-0">
            <DialogTitle className="text-sm font-medium truncate pr-4">{previewFile?.label}</DialogTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs shrink-0"
              onClick={() => openInNewTab(previewFile?.url ?? '')}>
              <ExternalLink className="h-3.5 w-3.5" />Abrir em nova aba
            </Button>
          </DialogHeader>
          {previewFile?.fileType === 'image' ? (
            <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-muted/30">
              <img src={previewFile.url} alt={previewFile.label} className="max-w-full max-h-full object-contain rounded" />
            </div>
          ) : isMobile ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-muted/30 text-center">
              <FileText className="w-14 h-14 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Pré-visualização de PDF não disponível no celular.</p>
              <Button className="gap-2" onClick={() => openInNewTab(previewFile?.url ?? '')}>
                <ExternalLink className="w-4 h-4" />Abrir PDF
              </Button>
            </div>
          ) : (
            <iframe src={previewFile?.url} className="flex-1 w-full border-0" title={previewFile?.label} />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Quality PDF ── */}
      <AlertDialog open={deletingQualityDate !== null} onOpenChange={(o) => { if (!o) setDeletingQualityDate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir PDF Quality?</AlertDialogTitle>
            <AlertDialogDescription>O arquivo será removido do Storage e o vínculo desfeito. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const g = groups.find((g) => g.data === deletingQualityDate);
                if (deletingQualityDate && g?.quality?.pdf_path) handleDeleteQualityPDF(deletingQualityDate, g.quality.pdf_path);
              }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Cancelar item (soft delete) ── */}
      <AlertDialog open={cancelingItem !== null} onOpenChange={(o) => { if (!o) setCancelingItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar item?</AlertDialogTitle>
            <AlertDialogDescription>
              O item ficará marcado como cancelado e não entrará em contagens ou conferência.
              Você pode restaurá-lo depois se necessário.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancelItem}
            >
              Cancelar item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Marcar Divergência ── */}
      <Dialog open={divDialog !== null} onOpenChange={(o) => { if (!o && !divDialog?.saving) setDivDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Marcar Divergência</DialogTitle>
          </DialogHeader>
          {divDialog && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {new Date(`${divDialog.data}T00:00:00`).toLocaleDateString('pt-BR')} — {divDialog.centroCusto}
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Observação <span className="text-destructive">*</span></Label>
                <Textarea
                  className="text-xs min-h-[80px] resize-none"
                  value={divDialog.obs}
                  onChange={(e) => setDivDialog((prev) => prev ? { ...prev, obs: e.target.value } : null)}
                  placeholder="Descreva a divergência encontrada..."
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDivDialog(null)} disabled={divDialog.saving}>
                  Cancelar
                </Button>
                <Button size="sm" variant="destructive" onClick={handleSetDivergencia} disabled={divDialog.saving || !divDialog.obs.trim()}>
                  {divDialog.saving ? 'Salvando…' : 'Confirmar Divergência'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirmar Marcar Recebido em Lote ── */}
      <AlertDialog open={confirmBatchReceive} onOpenChange={(o) => { if (!o) setConfirmBatchReceive(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar recebido no banco?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const sel = displayGroups.filter((g) => selectedKeys.has(`${g.data}-${g.centroCusto}`));
                const comFechamento = sel.filter((g) => g.pixFechamentoId).length;
                const semFechamento = sel.length - comFechamento;
                const pixBruto = sel.reduce((s, g) => s + g.totalPix, 0);
                const liquido = pixBruto - sel.reduce((s, g) => s + g.totalPixTarifa, 0);
                return (
                  <>
                    Será marcado <strong>recebido_banco = true</strong> em {comFechamento} fechamento(s) Pix.
                    {semFechamento > 0 && ` ${semFechamento} dia(s) sem fechamento Pix serão ignorados.`}
                    {' '}Total líquido: <strong>{fmt(liquido)}</strong>.
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchMarkReceived}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
