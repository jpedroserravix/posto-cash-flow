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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, Upload, FileText, X, ExternalLink, Paperclip, Gauge, AlertTriangle, Ban, RotateCcw, UserMinus } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { openInNewTab } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { useDateFilter } from '@/hooks/useDateFilter';
import { DateFilter } from '@/components/DateFilter';

// ─── types ───────────────────────────────────────────────────────────────────

const CONFERIDO_OPTIONS = ['OK', 'PENDENTE', 'DIVERGÊNCIA'];

interface TurnoRow {
  turno: string;
  cofreBrinks: number;
  manual: number;
  pix?: number;
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

interface GroupData {
  data: string;
  centroCusto: string;
  turnos: TurnoRow[];
  totalBrinks: number;
  totalManual: number;
  totalPix: number;
  totalGeral: number;
  conferido: string;
  observacao: string;
  resumoId?: string;
  quality?: QualityInfo;
  afericoes: AfericaoInfo[];
  comprovantes: Comprovante[];
  turnosConferidos: string[];
}

interface PreviewFile {
  url: string;
  label: string;
  fileType: 'pdf' | 'image';
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ResumoDiario() {
  const { selectedPostoId, nome } = useAuth();
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

  // Comprovante observation edits (keyed by comprovante id, auto-saved)
  const [compObsEdits, setCompObsEdits] = useState<Map<string, string>>(new Map());
  const obsTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Shared preview modal
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  const pagination = usePagination(displayGroups, [selectedPostoId, ccFilter], {
    defaultPageSize: 10,
    sessionKey: 'resumo_diario_pageSize',
  });

  useEffect(() => {
    if (selectedPostoId) loadResumo();
  }, [selectedPostoId, dfRange.start, dfRange.end]);

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
        .select('id, data, centro_custo')
        .eq('posto_id', selectedPostoId)
        .gte('data', dfRange.start)
        .lte('data', dfRange.end),
    ]);

    // Segunda query: turnos dos fechamentos Pix (por lista de ids, não por card)
    // pixMap: "data|cc|numero_turno" → total_calculado
    const pixMap = new Map<string, number>();
    const pixFechIds = (pixFechData as any[] ?? []).map((f: any) => f.id as string);
    if (pixFechIds.length > 0) {
      const { data: pixTurnosData } = await (supabase as any)
        .from('pix_fechamentos_turnos')
        .select('fechamento_id, numero_turno, total_calculado')
        .in('fechamento_id', pixFechIds);

      const fechIdToKey = new Map<string, string>();
      (pixFechData as any[]).forEach((f: any) => fechIdToKey.set(f.id, `${f.data}|${f.centro_custo}`));

      (pixTurnosData as any[] ?? []).forEach((t: any) => {
        const key = fechIdToKey.get(t.fechamento_id);
        if (key) pixMap.set(`${key}|${t.numero_turno}`, Number(t.total_calculado) || 0);
      });
    }

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
      const pix = turnoNum !== null ? pixMap.get(`${gKey}|${turnoNum}`) : undefined;
      arr.push({ turno, cofreBrinks: val.brinks, manual: val.manual, pix, total: val.brinks + val.manual });
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
        const totalBrinks = sorted.reduce((s, t) => s + t.cofreBrinks, 0);
        const totalManual = sorted.reduce((s, t) => s + t.manual, 0);
        const totalPix    = sorted.reduce((s, t) => s + (t.pix ?? 0), 0);
        const conf = confMap.get(key);
        return {
          data,
          centroCusto,
          turnos: sorted,
          totalBrinks,
          totalManual,
          totalPix,
          totalGeral: totalBrinks + totalManual,
          conferido: conf?.conferido || 'PENDENTE',
          observacao: conf?.observacao || '',
          resumoId: conf?.id,
          quality: qualityMap.get(data),
          afericoes: afericaoMap.get(data) || [],
          comprovantes: comprovantesMap.get(data) || [],
          turnosConferidos: conf?.turnos_conferidos || [],
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
          {pagination.paginatedData.map((group) => {
            const pdfUrl = group.quality?.pdf_path
              ? getStorageUrl('quality-pdfs', group.quality.pdf_path)
              : null;
            const dateLabel = new Date(`${group.data}T00:00:00`).toLocaleDateString('pt-BR');
            const visibleComprovantes = group.comprovantes.filter(
              (c) => c.tipo !== 'Nota a Prazo' || c.centro_custo === group.centroCusto
            );
            const totalItens = group.afericoes.filter((a) => !a.cancelado).length
              + visibleComprovantes.filter((c) => !c.cancelado).length;

            return (
              <Card key={`${group.data}-${group.centroCusto}`} className={borderColor(group.conferido)}>
                {/* ── Header ── */}
                <CardHeader className="px-4 pb-2 pt-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base">
                      {dateLabel} — {group.centroCusto}
                    </CardTitle>
                    <span className="text-lg font-bold">{fmt(group.totalGeral)}</span>
                  </div>
                </CardHeader>

                {/* ── Two-column body ── */}
                <CardContent className="px-4 pb-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* ─ Left: caixa summary ─ */}
                    <div className="space-y-3">
                      <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Turno</TableHead>
                            <TableHead className="text-right text-xs">Brinks</TableHead>
                            <TableHead className="text-right text-xs">Manual</TableHead>
                            <TableHead className="text-right text-xs text-primary">Pix</TableHead>
                            <TableHead className="text-right text-xs">Total</TableHead>
                            <TableHead className="text-center text-xs w-8" title="Conferido">✓</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.turnos.map((turno) => (
                            <TableRow key={turno.turno}>
                              <TableCell className="py-1 text-xs">{turno.turno}</TableCell>
                              <TableCell className="py-1 text-right text-xs">{fmt(turno.cofreBrinks)}</TableCell>
                              <TableCell className="py-1 text-right text-xs">{fmt(turno.manual)}</TableCell>
                              <TableCell className="py-1 text-right text-xs text-primary whitespace-nowrap">
                                {turno.pix !== undefined ? fmt(turno.pix) : '—'}
                              </TableCell>
                              <TableCell className="py-1 text-right text-xs font-medium">{fmt(turno.total)}</TableCell>
                              <TableCell className="py-1 text-center">
                                <Checkbox
                                  checked={group.turnosConferidos.includes(turno.turno)}
                                  onCheckedChange={() => handleToggleTurno(group, turno.turno)}
                                  className="h-4 w-4"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="border-t-2">
                            <TableCell className="py-1 text-xs font-bold">Soma</TableCell>
                            <TableCell className="py-1 text-right text-xs font-bold">{fmt(group.totalBrinks)}</TableCell>
                            <TableCell className="py-1 text-right text-xs font-bold">{fmt(group.totalManual)}</TableCell>
                            <TableCell className="py-1 text-right text-xs font-bold text-primary whitespace-nowrap">
                              {group.totalPix > 0 ? fmt(group.totalPix) : '—'}
                            </TableCell>
                            <TableCell className="py-1 text-right text-xs font-bold">{fmt(group.totalGeral)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                      </div>

                      {/* Quality PDF */}
                      <div className="flex flex-wrap items-center gap-2">
                        {pdfUrl ? (
                          <div className="group/pdf relative">
                            <HoverCard openDelay={300} closeDelay={100}>
                              <HoverCardTrigger asChild>
                                <button
                                  className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-all hover:scale-105 hover:border-primary hover:text-foreground"
                                  onClick={() => {
                                    if (isMobile) { openInNewTab(pdfUrl); return; }
                                    setPreviewFile({ url: pdfUrl, label: `PDF Quality — ${dateLabel}`, fileType: 'pdf' });
                                  }}
                                >
                                  <FileText className="h-3.5 w-3.5 text-red-500" />
                                  <span>PDF Quality</span>
                                </button>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80 p-1.5" align="start" side="bottom">
                                <p className="mb-1 px-0.5 text-[10px] text-muted-foreground">Clique para abrir com zoom</p>
                                <iframe src={pdfUrl} className="h-52 w-full rounded border border-border" title="Preview PDF Quality" />
                              </HoverCardContent>
                            </HoverCard>
                            <button
                              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover/pdf:opacity-100"
                              onClick={() => setDeletingQualityDate(group.data)}
                              title="Remover PDF"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="text-xs opacity-60">Sem PDF Quality</Badge>
                        )}
                        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs"
                          onClick={() => { setUploadingQualityDate(group.data); qualityFileInputRef.current?.click(); }}>
                          <Upload className="mr-1 h-3 w-3" />
                          {pdfUrl ? 'Substituir PDF' : 'Importar PDF Quality'}
                        </Button>
                      </div>
                    </div>

                    {/* ─ Right: itens do caixa ─ */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">Itens do Caixa</span>
                          {totalItens > 0 && (
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{totalItens}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" className="h-6 text-xs"
                            onClick={() => setFaltaDialog({ data: group.data, centroCusto: group.centroCusto, tipo: 'Falta de Caixa', funcionarioId: '', valor: '', observacao: '', saving: false })}>
                            <UserMinus className="mr-1 h-3 w-3" />Falta de Caixa
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 text-xs"
                            onClick={() => { setUploadingComprovDate(group.data); comprovantesFileInputRef.current?.click(); }}>
                            <Upload className="mr-1 h-3 w-3" />Adicionar
                          </Button>
                        </div>
                      </div>

                      {group.afericoes.length === 0 && visibleComprovantes.length === 0 && (
                        <p className="text-xs text-muted-foreground py-2">Nenhum item de caixa.</p>
                      )}

                      {/* Aferições */}
                      {group.afericoes.map((af) => {
                        const afUrl = af.pdf_path ? getStorageUrl('despesas-comprovantes', af.pdf_path) : null;
                        return (
                          <div key={af.id} className={`group/af flex items-center gap-2 rounded-md border p-2 ${af.cancelado ? 'bg-muted/40 opacity-70' : ''}`}>
                            {!af.cancelado && (
                              <Checkbox
                                checked={af.item_conferido}
                                onCheckedChange={() => handleToggleAfericao(af.id, af.item_conferido)}
                                className="h-4 w-4 shrink-0"
                              />
                            )}
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
                                    className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                                    onClick={() => {
                                      if (isMobile) { openInNewTab(afUrl); return; }
                                      setPreviewFile({ url: afUrl, label: `Aferição de Bicos — ${dateLabel}`, fileType: 'pdf' });
                                    }}
                                  >
                                    <FileText className="h-3.5 w-3.5 text-red-500" />
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

                      {/* Comprovantes (Despesa, Outros, Nota a Prazo) */}
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
                        return (
                          <div key={comp.id} className={`group/comp flex items-start gap-2 rounded-md border p-2 ${comp.cancelado ? 'bg-muted/40 opacity-70' : ''}`}>
                            {!comp.cancelado && (
                              <Checkbox
                                checked={comp.item_conferido}
                                onCheckedChange={() => handleToggleComprovante(comp.id, comp.item_conferido)}
                                className="h-4 w-4 shrink-0 mt-0.5"
                              />
                            )}
                            {/* Preview trigger — only when file exists and not cancelled */}
                            {compUrl && !comp.cancelado && (
                              <div className="relative shrink-0">
                                <HoverCard openDelay={300} closeDelay={100}>
                                  <HoverCardTrigger asChild>
                                    <button
                                      className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                                      onClick={() => {
                                        if (comp.file_type !== 'image' && isMobile) { openInNewTab(compUrl); return; }
                                        setPreviewFile({ url: compUrl, label: comp.file_name ?? compLabel, fileType: comp.file_type ?? 'pdf' });
                                      }}
                                    >
                                      {comp.file_type === 'image' ? (
                                        <img src={compUrl} className="h-5 w-5 rounded object-cover" alt="" />
                                      ) : (
                                        <FileText className="h-4 w-4 text-red-500" />
                                      )}
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
                              </div>
                            )}

                            {/* Label + observation (or cancelled info) */}
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className={`text-[10px] truncate ${
                                comp.cancelado ? 'line-through text-muted-foreground' :
                                comp.tipo === 'Falta de Caixa' ? 'text-red-600 dark:text-red-400 font-medium' :
                                comp.tipo === 'Sobra de Caixa' ? 'text-green-600 dark:text-green-400 font-medium' :
                                'text-muted-foreground'
                              }`}>{compLabel}</div>
                              {comp.cancelado ? (
                                <p className="text-[10px] text-muted-foreground">
                                  Cancelado por {comp.cancelado_por_nome} em {formatDateTime(comp.cancelado_em)}
                                </p>
                              ) : (
                                <Input
                                  className="h-6 text-xs border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-primary bg-transparent"
                                  value={getCompObs(comp)}
                                  onChange={(e) => handleCompObsChange(comp.id, e.target.value)}
                                  placeholder="Observação..."
                                />
                              )}
                            </div>

                            {/* Cancel / Restore */}
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
                </CardContent>

                {/* ── Footer: status + observação geral + save ── */}
                <CardFooter className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-1 border-t">
                  <Select
                    value={group.conferido}
                    onValueChange={(v) => updateGroup(group.data, group.centroCusto, 'conferido', v)}
                  >
                    <SelectTrigger className={`h-8 w-36 text-xs ${
                      group.conferido === 'OK' ? 'border-success text-success'
                      : group.conferido === 'DIVERGÊNCIA' ? 'border-destructive text-destructive'
                      : 'border-warning text-warning'
                    }`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONFERIDO_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Input
                    className="h-8 min-w-[120px] flex-1 text-xs"
                    value={group.observacao}
                    onChange={(e) => updateGroup(group.data, group.centroCusto, 'observacao', e.target.value)}
                    placeholder="Observação geral do caixa"
                  />

                  <Button size="sm" variant="ghost" onClick={() => handleSaveGroup(group)}>
                    <Save className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}

          <PaginationControls
            page={pagination.page} totalPages={pagination.totalPages}
            pageSize={pagination.pageSize} totalItems={pagination.totalItems}
            startIndex={pagination.startIndex} endIndex={pagination.endIndex}
            onPageChange={pagination.setPage} onPageSizeChange={pagination.handlePageSizeChange}
            pageSizeOptions={[10, 20, 50]} itemLabel="caixas"
          />
        </>
      )}

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
    </div>
  );
}
