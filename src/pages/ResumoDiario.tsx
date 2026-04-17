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
import { toast } from 'sonner';
import { Save, Upload, FileText, X, ExternalLink, Paperclip } from 'lucide-react';
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
  total: number;
}

interface QualityInfo {
  pdf_path: string | null;
  quality_conferido: string;
}

interface Comprovante {
  id: string;
  file_path: string;
  file_name: string;
  file_type: 'pdf' | 'image';
  observacao: string | null;
}

interface GroupData {
  data: string;
  centroCusto: string;
  turnos: TurnoRow[];
  totalBrinks: number;
  totalManual: number;
  totalGeral: number;
  conferido: string;
  observacao: string;
  resumoId?: string;
  quality?: QualityInfo;
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
  const { selectedPostoId } = useAuth();
  const isMobile = useIsMobile();
  const { preset: dfPreset, range: dfRange, setPreset: setDfPreset } = useDateFilter();
  const [groups, setGroups] = useState<GroupData[]>([]);

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
  const [deletingComprovante, setDeletingComprovante] = useState<{ id: string; file_path: string } | null>(null);
  const comprovantesFileInputRef = useRef<HTMLInputElement>(null);

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

  // ─── load ──────────────────────────────────────────────────────────────────

  const loadResumo = async () => {
    if (!selectedPostoId) return;

    const [
      { data: brinks },
      { data: manuais },
      { data: conferencias },
      { data: qualityData },
      { data: comprovantesData },
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
        .select('id, data_caixa, file_path, file_name, file_type, observacao')
        .eq('posto_id', selectedPostoId).gte('data_caixa', dfRange.start).lte('data_caixa', dfRange.end),
    ]);

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
    const groupMap = new Map<string, TurnoRow[]>();
    turnoMap.forEach((val, key) => {
      const [data, cc, turno] = key.split('|');
      const gKey = `${data}|${cc}`;
      const arr = groupMap.get(gKey) || [];
      arr.push({ turno, cofreBrinks: val.brinks, manual: val.manual, total: val.brinks + val.manual });
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
      arr.push({ id: c.id, file_path: c.file_path, file_name: c.file_name, file_type: c.file_type, observacao: c.observacao ?? null });
      comprovantesMap.set(c.data_caixa, arr);
    });

    const result: GroupData[] = Array.from(groupMap.entries())
      .map(([key, turnos]) => {
        const [data, centroCusto] = key.split('|');
        const sorted = turnos.sort((a, b) => a.turno.localeCompare(b.turno));
        const totalBrinks = sorted.reduce((s, t) => s + t.cofreBrinks, 0);
        const totalManual = sorted.reduce((s, t) => s + t.manual, 0);
        const conf = confMap.get(key);
        return {
          data,
          centroCusto,
          turnos: sorted,
          totalBrinks,
          totalManual,
          totalGeral: totalBrinks + totalManual,
          conferido: conf?.conferido || 'PENDENTE',
          observacao: conf?.observacao || '',
          resumoId: conf?.id,
          quality: qualityMap.get(data),
          comprovantes: comprovantesMap.get(data) || [],
          turnosConferidos: conf?.turnos_conferidos || [],
        };
      })
      .sort((a, b) => b.data.localeCompare(a.data) || a.centroCusto.localeCompare(b.centroCusto));

    setGroups(result);
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

  const handleDeleteComprovante = async () => {
    if (!deletingComprovante) return;
    await supabase.storage.from('despesas-comprovantes').remove([deletingComprovante.file_path]);
    await (supabase as any).from('comprovantes_despesas').delete().eq('id', deletingComprovante.id);
    toast.success('Comprovante removido.');
    setDeletingComprovante(null);
    loadResumo();
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

  // ─── render ────────────────────────────────────────────────────────────────

  if (!selectedPostoId) {
    return <p className="py-8 text-center text-muted-foreground">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Resumo Diário / CAIXAS</h1>

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
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Turno</TableHead>
                            <TableHead className="text-right text-xs">Brinks</TableHead>
                            <TableHead className="text-right text-xs">Manual</TableHead>
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
                            <TableCell className="py-1 text-right text-xs font-bold">{fmt(group.totalGeral)}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>

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

                    {/* ─ Right: comprovantes e despesas ─ */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground font-medium">Comprovantes e Despesas</span>
                          {group.comprovantes.length > 0 && (
                            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                              {group.comprovantes.length}
                            </Badge>
                          )}
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 text-xs"
                          onClick={() => { setUploadingComprovDate(group.data); comprovantesFileInputRef.current?.click(); }}>
                          <Upload className="mr-1 h-3 w-3" />Adicionar
                        </Button>
                      </div>

                      {group.comprovantes.length === 0 && (
                        <p className="text-xs text-muted-foreground py-2">Nenhum comprovante anexado.</p>
                      )}

                      {group.comprovantes.map((comp) => {
                        const compUrl = getStorageUrl('despesas-comprovantes', comp.file_path);
                        return (
                          <div key={comp.id} className="group/comp flex items-start gap-2 rounded-md border p-2">
                            {/* Preview trigger */}
                            <div className="relative shrink-0">
                              <HoverCard openDelay={300} closeDelay={100}>
                                <HoverCardTrigger asChild>
                                  <button
                                    className="flex items-center gap-1 rounded border border-border px-1.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                                    onClick={() => {
                                      if (comp.file_type !== 'image' && isMobile) { openInNewTab(compUrl); return; }
                                      setPreviewFile({ url: compUrl, label: comp.file_name, fileType: comp.file_type });
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
                                    <img src={compUrl} className="w-full max-h-48 rounded border object-contain" alt={comp.file_name} />
                                  ) : (
                                    <>
                                      <p className="mb-1 px-0.5 text-[10px] text-muted-foreground">Clique para abrir com zoom</p>
                                      <iframe src={compUrl} className="h-40 w-full rounded border border-border" title={comp.file_name} />
                                    </>
                                  )}
                                </HoverCardContent>
                              </HoverCard>
                            </div>

                            {/* File name + observation */}
                            <div className="flex-1 min-w-0 space-y-0.5">
                              <div className="text-[10px] text-muted-foreground truncate">{comp.file_name}</div>
                              <Input
                                className="h-6 text-xs border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-b-primary bg-transparent"
                                value={getCompObs(comp)}
                                onChange={(e) => handleCompObsChange(comp.id, e.target.value)}
                                placeholder="Observação..."
                              />
                            </div>

                            {/* Delete */}
                            <button
                              className="opacity-0 group-hover/comp:opacity-100 transition-opacity shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                              onClick={() => setDeletingComprovante({ id: comp.id, file_path: comp.file_path })}
                              title="Remover"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
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

      {/* ── Delete comprovante ── */}
      <AlertDialog open={deletingComprovante !== null} onOpenChange={(o) => { if (!o) setDeletingComprovante(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir comprovante?</AlertDialogTitle>
            <AlertDialogDescription>O arquivo será removido permanentemente. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteComprovante}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
