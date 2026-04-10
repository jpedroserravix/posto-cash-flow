import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Save, Upload, FileText, X, ExternalLink } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';

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
}

export default function ResumoDiario() {
  const { selectedPostoId } = useAuth();
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [uploadingDate, setUploadingDate] = useState<string | null>(null);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ url: string; label: string } | null>(null);
  const qualityFileInputRef = useRef<HTMLInputElement>(null);

  const pagination = usePagination(groups, [selectedPostoId], {
    defaultPageSize: 10,
    sessionKey: 'resumo_diario_pageSize',
  });

  useEffect(() => {
    if (selectedPostoId) loadResumo();
  }, [selectedPostoId]);

  const loadResumo = async () => {
    if (!selectedPostoId) return;

    const [{ data: brinks }, { data: manuais }, { data: conferencias }, { data: qualityData }] = await Promise.all([
      supabase
        .from('depositos_brinks')
        .select('data_caixa, turno, valor, centro_custo')
        .eq('posto_id', selectedPostoId)
        .not('data_caixa', 'is', null)
        .not('turno', 'is', null),
      supabase
        .from('depositos_manuais')
        .select('data, turno, valor_lancado, centro_custo')
        .eq('posto_id', selectedPostoId),
      supabase
        .from('resumo_conferencia')
        .select('*')
        .eq('posto_id', selectedPostoId),
      supabase
        .from('relatorio_quality')
        .select('data_caixa, pdf_path, quality_conferido')
        .eq('posto_id', selectedPostoId),
    ]);

    const turnoMap = new Map<string, { brinks: number; manual: number }>();

    brinks?.forEach((b) => {
      if (!b.data_caixa || !b.turno || !b.centro_custo) return;
      const cc = b.centro_custo || 'SEM CENTRO';
      const key = `${b.data_caixa}|${cc}|${b.turno}`;
      const existing = turnoMap.get(key) || { brinks: 0, manual: 0 };
      existing.brinks += b.valor;
      turnoMap.set(key, existing);
    });

    manuais?.forEach((m) => {
      if (!m.centro_custo) return;
      const key = `${m.data}|${m.centro_custo}|${m.turno}`;
      const existing = turnoMap.get(key) || { brinks: 0, manual: 0 };
      existing.manual += m.valor_lancado;
      turnoMap.set(key, existing);
    });

    const groupMap = new Map<string, TurnoRow[]>();
    turnoMap.forEach((val, key) => {
      const [data, cc, turno] = key.split('|');
      const groupKey = `${data}|${cc}`;
      const arr = groupMap.get(groupKey) || [];
      arr.push({ turno, cofreBrinks: val.brinks, manual: val.manual, total: val.brinks + val.manual });
      groupMap.set(groupKey, arr);
    });

    const confMap = new Map<string, { conferido: string; observacao: string; id: string }>();
    conferencias?.forEach((c) => {
      const cc = c.centro_custo || 'SEM CENTRO';
      const key = `${c.data}|${cc}`;
      const existing = confMap.get(key);
      if (!existing || c.turno === null) {
        confMap.set(key, { conferido: c.conferido, observacao: c.observacao || '', id: c.id });
      }
    });

    const qualityMap = new Map<string, QualityInfo>();
    qualityData?.forEach((q: any) => {
      qualityMap.set(q.data_caixa, {
        pdf_path: q.pdf_path ?? null,
        quality_conferido: q.quality_conferido ?? 'PENDENTE',
      });
    });

    const result: GroupData[] = Array.from(groupMap.entries())
      .map(([key, turnos]) => {
        const [data, centroCusto] = key.split('|');
        const sorted = turnos.sort((a, b) => a.turno.localeCompare(b.turno));
        const totalBrinks = sorted.reduce((sum, t) => sum + t.cofreBrinks, 0);
        const totalManual = sorted.reduce((sum, t) => sum + t.manual, 0);
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
        };
      })
      .sort((a, b) => b.data.localeCompare(a.data) || a.centroCusto.localeCompare(b.centroCusto));

    setGroups(result);
  };

  const getPdfUrl = (path: string) => {
    const { data } = supabase.storage.from('quality-pdfs').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleUploadQualityPDF = async (file: File) => {
    if (!uploadingDate || !selectedPostoId) return;
    const path = `${selectedPostoId}/${uploadingDate}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('quality-pdfs')
      .upload(path, file, { upsert: true, contentType: 'application/pdf' });

    if (uploadError) {
      toast.error('Erro ao enviar PDF: ' + uploadError.message);
      return;
    }

    const { error: dbError } = await supabase
      .from('relatorio_quality')
      .upsert({
        posto_id: selectedPostoId,
        data_caixa: uploadingDate,
        pdf_path: path,
        quality_conferido: 'PENDENTE',
      } as any, { onConflict: 'posto_id,data_caixa' });

    if (dbError) {
      toast.error('Erro ao salvar: ' + dbError.message);
      return;
    }

    toast.success('PDF importado com sucesso!');
    setUploadingDate(null);
    loadResumo();
  };

  const handleDeleteQualityPDF = async (data_caixa: string, pdf_path: string) => {
    const { error: storageError } = await supabase.storage
      .from('quality-pdfs')
      .remove([pdf_path]);

    if (storageError) {
      toast.error('Erro ao deletar arquivo: ' + storageError.message);
      return;
    }

    const { error: dbError } = await supabase
      .from('relatorio_quality')
      .update({ pdf_path: null, quality_conferido: 'PENDENTE' } as any)
      .eq('posto_id', selectedPostoId!)
      .eq('data_caixa', data_caixa);

    if (dbError) {
      toast.error('Erro ao atualizar registro: ' + dbError.message);
      return;
    }

    toast.success('PDF removido.');
    setDeletingDate(null);
    loadResumo();
  };

  const handleToggleQualityStatus = async (data_caixa: string, currentStatus: string) => {
    if (!selectedPostoId) return;
    const newStatus = currentStatus === 'OK' ? 'PENDENTE' : 'OK';
    const { error } = await supabase
      .from('relatorio_quality')
      .update({ quality_conferido: newStatus } as any)
      .eq('posto_id', selectedPostoId)
      .eq('data_caixa', data_caixa);

    if (error) { toast.error('Erro: ' + error.message); return; }
    loadResumo();
  };

  const handleSaveGroup = async (group: GroupData) => {
    if (!selectedPostoId) return;

    const payload = {
      posto_id: selectedPostoId,
      data: group.data,
      turno: null as string | null,
      centro_custo: group.centroCusto === 'SEM CENTRO' ? null : group.centroCusto,
      conferido: group.conferido,
      observacao: group.observacao || null,
    };

    if (group.resumoId) {
      const { error } = await supabase
        .from('resumo_conferencia')
        .update({ turno: null as string | null, centro_custo: payload.centro_custo, conferido: payload.conferido, observacao: payload.observacao })
        .eq('id', group.resumoId);
      if (error) { toast.error('Erro: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('resumo_conferencia').insert(payload);
      if (error) { toast.error('Erro: ' + error.message); return; }
    }

    toast.success('Salvo');
    loadResumo();
  };

  const updateGroup = (index: number, field: 'conferido' | 'observacao', value: string) => {
    setGroups((prev) => prev.map((group, i) => (i === index ? { ...group, [field]: value } : group)));
  };

  const formatCurrency = (value: number | null | undefined) =>
    (value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const borderColor = (status: string) => {
    if (status === 'OK') return 'border-l-4 border-l-success';
    if (status === 'DIVERGÊNCIA') return 'border-l-4 border-l-destructive';
    return 'border-l-4 border-l-warning';
  };

  if (!selectedPostoId) {
    return <p className="py-8 text-center text-muted-foreground">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Resumo Diário</h1>

      {/* Hidden file input — shared across all cards */}
      <input
        ref={qualityFileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadQualityPDF(file);
          if (qualityFileInputRef.current) qualityFileInputRef.current.value = '';
        }}
      />

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-sm text-muted-foreground">
              Nenhum dado para exibir. Importe depósitos Brinks ou cadastre depósitos manuais.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pagination.paginatedData.map((group, i) => {
            const i_real = (pagination.page - 1) * pagination.pageSize + i;
            const pdfUrl = group.quality?.pdf_path ? getPdfUrl(group.quality.pdf_path) : null;

            return (
              <Card key={`${group.data}-${group.centroCusto}`} className={borderColor(group.conferido)}>
                <CardHeader className="px-4 pb-2 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">
                      {new Date(`${group.data}T00:00:00`).toLocaleDateString('pt-BR')} — {group.centroCusto}
                    </CardTitle>
                    <span className="text-lg font-bold">{formatCurrency(group.totalGeral)}</span>
                  </div>
                </CardHeader>

                <CardContent className="px-4 pb-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Turno</TableHead>
                        <TableHead className="text-right text-xs">Cofre Brinks</TableHead>
                        <TableHead className="text-right text-xs">Manual</TableHead>
                        <TableHead className="text-right text-xs">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.turnos.map((turno) => (
                        <TableRow key={turno.turno}>
                          <TableCell className="py-1 text-xs">{turno.turno}</TableCell>
                          <TableCell className="py-1 text-right text-xs">{formatCurrency(turno.cofreBrinks)}</TableCell>
                          <TableCell className="py-1 text-right text-xs">{formatCurrency(turno.manual)}</TableCell>
                          <TableCell className="py-1 text-right text-xs font-medium">{formatCurrency(turno.total)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="border-t-2">
                        <TableCell className="py-1 text-xs font-bold">Soma</TableCell>
                        <TableCell className="py-1 text-right text-xs font-bold">{formatCurrency(group.totalBrinks)}</TableCell>
                        <TableCell className="py-1 text-right text-xs font-bold">{formatCurrency(group.totalManual)}</TableCell>
                        <TableCell className="py-1 text-right text-xs font-bold">{formatCurrency(group.totalGeral)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  {/* Quality PDF row */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {pdfUrl ? (
                      <>
                        {/* PDF thumbnail with hover preview + delete button */}
                        <div className="group/pdf relative">
                          <HoverCard openDelay={300} closeDelay={100}>
                            <HoverCardTrigger asChild>
                              <button
                                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-all hover:scale-105 hover:border-primary hover:text-foreground"
                                onClick={() => setPreviewPdf({
                                  url: pdfUrl,
                                  label: `PDF Quality — ${new Date(`${group.data}T00:00:00`).toLocaleDateString('pt-BR')}`,
                                })}
                              >
                                <FileText className="h-3.5 w-3.5 text-red-500" />
                                <span>PDF Quality</span>
                                <span className="text-muted-foreground/60">
                                  {new Date(`${group.data}T00:00:00`).toLocaleDateString('pt-BR')}
                                </span>
                              </button>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80 p-1.5" align="start" side="bottom">
                              <p className="mb-1 px-0.5 text-[10px] text-muted-foreground">
                                Clique para abrir com zoom
                              </p>
                              <iframe
                                src={pdfUrl}
                                className="h-52 w-full rounded border border-border"
                                title="Preview PDF Quality"
                              />
                            </HoverCardContent>
                          </HoverCard>
                          <button
                            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover/pdf:opacity-100"
                            onClick={() => setDeletingDate(group.data)}
                            title="Remover PDF"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>

                      </>
                    ) : (
                      <Badge variant="secondary" className="text-xs opacity-60">Sem PDF Quality</Badge>
                    )}

                    {/* Upload button — always visible */}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-7 text-xs"
                      onClick={() => { setUploadingDate(group.data); qualityFileInputRef.current?.click(); }}
                    >
                      <Upload className="mr-1 h-3 w-3" />
                      {pdfUrl ? 'Substituir PDF' : 'Importar PDF Quality'}
                    </Button>
                  </div>
                </CardContent>

                <CardFooter className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-1">
                  <Select value={group.conferido} onValueChange={(value) => updateGroup(i_real, 'conferido', value)}>
                    <SelectTrigger
                      className={`h-8 w-36 text-xs ${
                        group.conferido === 'OK'
                          ? 'border-success text-success'
                          : group.conferido === 'DIVERGÊNCIA'
                            ? 'border-destructive text-destructive'
                            : 'border-warning text-warning'
                      }`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONFERIDO_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    className="h-8 min-w-[120px] flex-1 text-xs"
                    value={group.observacao}
                    onChange={(e) => updateGroup(i_real, 'observacao', e.target.value)}
                    placeholder="Observação"
                  />

                  <Button size="sm" variant="ghost" onClick={() => handleSaveGroup(group)}>
                    <Save className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            );
          })}

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            startIndex={pagination.startIndex}
            endIndex={pagination.endIndex}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.handlePageSizeChange}
            pageSizeOptions={[10, 20, 50]}
            itemLabel="caixas"
          />
        </>
      )}
      {/* PDF zoom modal */}
      <Dialog open={previewPdf !== null} onOpenChange={(open) => { if (!open) setPreviewPdf(null); }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="flex-row items-center justify-between px-4 py-2 border-b shrink-0">
            <DialogTitle className="text-sm font-medium">{previewPdf?.label}</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => window.open(previewPdf?.url, '_blank')}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir em nova aba
            </Button>
          </DialogHeader>
          <iframe
            src={previewPdf?.url}
            className="flex-1 w-full border-0"
            title="PDF Quality"
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deletingDate !== null} onOpenChange={(open) => { if (!open) setDeletingDate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir PDF Quality?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este PDF? O arquivo será removido do Storage e o vínculo desfeito. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const group = groups.find((g) => g.data === deletingDate);
                if (deletingDate && group?.quality?.pdf_path) {
                  handleDeleteQualityPDF(deletingDate, group.quality.pdf_path);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
