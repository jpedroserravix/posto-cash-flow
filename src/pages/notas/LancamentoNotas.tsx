import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePagination } from '@/hooks/usePagination';
import { useDateFilter } from '@/hooks/useDateFilter';
import { PaginationControls } from '@/components/PaginationControls';
import { DateFilter } from '@/components/DateFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  HoverCard, HoverCardContent, HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  ChevronDown, ChevronRight, MoreHorizontal, Paperclip,
  ExternalLink, FileText, AlertCircle, Trash2,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { openInNewTab } from '@/lib/utils';

// ─── types ──────────────────────────────────────────────────────────────────

type StatusNota = 'Pendente' | 'Lançado' | 'Divergência' | 'Cancelado';

interface NotaCompra {
  id: string;
  posto_id: string;
  enviado_por: string | null;
  enviado_por_nome: string | null;
  fornecedor: string;
  data_chegada: string | null;
  observacoes: string | null;
  nf_path: string | null;
  nf_type: string | null;
  boleto_path: string | null;
  boleto_type: string | null;
  mercadoria_path: string | null;
  mercadoria_type: string | null;
  pedido_id: string | null;
  pedidos_compra: { id: string; numero: string | null; fornecedor: string | null } | null;
  status: StatusNota;
  created_at: string;
}

interface Historico {
  id: string;
  nota_id: string;
  status_anterior: string | null;
  status_novo: string;
  observacao: string | null;
  feito_por: string | null;
  feito_por_nome: string | null;
  created_at: string;
}

interface PreviewFile {
  url: string;
  label: string;
  type: 'image' | 'pdf';
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDatetime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR');
}

function getPublicUrl(path: string) {
  return supabase.storage.from('documentos-comprovantes').getPublicUrl(path).data.publicUrl;
}

// ─── sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StatusNota }) {
  const cls: Record<StatusNota, string> = {
    Pendente:    'bg-yellow-500 hover:bg-yellow-500 text-white',
    Lançado:     'bg-green-600 hover:bg-green-600 text-white',
    Divergência: 'bg-red-500 hover:bg-red-500 text-white',
    Cancelado:   'bg-gray-400 hover:bg-gray-400 text-white',
  };
  return <Badge className={`${cls[status]} text-[10px] whitespace-nowrap`}>{status}</Badge>;
}

function FilePreviewButton({
  path, type, label, onOpen,
}: {
  path: string;
  type: string | null;
  label: string;
  onOpen: (f: PreviewFile) => void;
}) {
  const isMobile = useIsMobile();
  const isImg = type === 'image';
  const url = getPublicUrl(path);
  const handleClick = () => {
    if (!isImg && isMobile) { openInNewTab(url); return; }
    onOpen({ url, label, type: isImg ? 'image' : 'pdf' });
  };
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button
          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
          onClick={handleClick}
          title={label}
        >
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="left" className="w-48 p-1">
        {isImg ? (
          <img src={url} className="w-full rounded object-cover" alt="" />
        ) : (
          <iframe src={url} className="w-full h-36 rounded" title="preview" />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function HistoricoItem({ h }: { h: Historico }) {
  return (
    <div className="flex gap-3 text-xs">
      <div className="shrink-0 w-[130px] text-muted-foreground whitespace-nowrap">
        {formatDatetime(h.created_at)}
      </div>
      <div className="flex-1">
        <span className="font-medium">{h.feito_por_nome || 'Sistema'}</span>
        {h.status_anterior ? (
          <> mudou de <span className="font-medium">{h.status_anterior}</span> para{' '}</>
        ) : (
          <> registrou como{' '}</>
        )}
        <span className="font-medium">{h.status_novo}</span>
        {h.observacao && (
          <div className="mt-0.5 text-muted-foreground italic">"{h.observacao}"</div>
        )}
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function LancamentoNotas() {
  const { user, role, nome, username, allPostos, selectedPostoId } = useAuth();
  const isMobile = useIsMobile();
  const showPostoFilter = allPostos.length > 0;

  const { preset: dfPreset, range: dfRange, setPreset: setDfPreset } = useDateFilter('thisMonth');

  const [notas, setNotas]           = useState<NotaCompra[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // filters
  const [filterPostoId, setFilterPostoId]   = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [searchFornecedor, setSearchFornecedor] = useState('');

  // history expand
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [history, setHistory]         = useState<Record<string, Historico[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

  // status change dialog
  const [statusDialog, setStatusDialog] = useState<{ nota: NotaCompra; target: StatusNota } | null>(null);
  const [statusObs, setStatusObs]       = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  // delete
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // preview modal
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // ── data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    loadNotas();
  }, [selectedPostoId, allPostos, dfRange.start, dfRange.end]);

  const loadNotas = async () => {
    setLoadingData(true);
    try {
      let query = (supabase as any)
        .from('notas_fiscais_compra')
        .select('*, pedidos_compra:pedido_id(id, numero, fornecedor)')
        .gte('created_at', dfRange.start + 'T00:00:00')
        .lte('created_at', dfRange.end + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (allPostos.length > 0) {
        query = query.in('posto_id', allPostos.map((p) => p.id));
      } else if (selectedPostoId) {
        query = query.eq('posto_id', selectedPostoId);
      }

      const { data, error } = await query;
      if (error) { console.error(error); return; }
      setNotas((data || []) as NotaCompra[]);
    } finally {
      setLoadingData(false);
    }
  };

  const loadHistory = async (notaId: string) => {
    if (history[notaId]) return; // already loaded
    setLoadingHistory(notaId);
    const { data, error } = await (supabase as any)
      .from('notas_fiscais_compra_historico')
      .select('*')
      .eq('nota_id', notaId)
      .order('created_at', { ascending: true });
    if (!error && data) {
      setHistory((prev) => ({ ...prev, [notaId]: data as Historico[] }));
    }
    setLoadingHistory(null);
  };

  const toggleHistory = (notaId: string) => {
    if (expandedId === notaId) {
      setExpandedId(null);
    } else {
      setExpandedId(notaId);
      loadHistory(notaId);
    }
  };

  // ── postos lookup ──────────────────────────────────────────────────────────
  const postoNomeMap = useMemo(() => {
    const m: Record<string, string> = {};
    allPostos.forEach((p) => { m[p.id] = p.nome; });
    return m;
  }, [allPostos]);

  const postoNome = (id: string) => postoNomeMap[id] || '—';

  // ── derived / filtered ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...notas];
    if (filterPostoId)    list = list.filter((n) => n.posto_id === filterPostoId);
    if (filterStatus)     list = list.filter((n) => n.status === filterStatus);
    if (searchFornecedor) {
      const q = searchFornecedor.toLowerCase();
      list = list.filter((n) => n.fornecedor.toLowerCase().includes(q));
    }
    return list;
  }, [notas, filterPostoId, filterStatus, searchFornecedor]);

  const pagination = usePagination(filtered, [filterPostoId, filterStatus, searchFornecedor, dfRange.start, dfRange.end], {
    defaultPageSize: 20,
    sessionKey: 'lancamento_notas_pageSize',
  });

  // ── status change ──────────────────────────────────────────────────────────
  const obsRequired = (target: StatusNota) =>
    target === 'Divergência' || target === 'Cancelado';

  const openStatusDialog = (nota: NotaCompra, target: StatusNota) => {
    setStatusObs('');
    setStatusDialog({ nota, target });
  };

  const confirmStatusChange = async () => {
    if (!statusDialog) return;
    const { nota, target } = statusDialog;
    if (obsRequired(target) && !statusObs.trim()) {
      toast.error('A observação é obrigatória para este status.');
      return;
    }
    setStatusLoading(true);
    try {
      const { error: e1 } = await (supabase as any)
        .from('notas_fiscais_compra')
        .update({ status: target })
        .eq('id', nota.id);
      if (e1) throw e1;

      const { error: e2 } = await (supabase as any)
        .from('notas_fiscais_compra_historico')
        .insert({
          nota_id:         nota.id,
          status_anterior: nota.status,
          status_novo:     target,
          observacao:      statusObs.trim() || null,
          feito_por:       user?.id ?? null,
          feito_por_nome:  nome || username || user?.email || null,
        });
      if (e2) throw e2;

      toast.success(`Status alterado para "${target}"`);
      setNotas((prev) => prev.map((n) => n.id === nota.id ? { ...n, status: target } : n));
      // invalidate cached history for this note
      setHistory((prev) => { const next = { ...prev }; delete next[nota.id]; return next; });
      setStatusDialog(null);
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setStatusLoading(false);
    }
  };

  // Direct revert to Pendente (no obs required)
  const revertToPendente = async (nota: NotaCompra) => {
    try {
      const { error: e1 } = await (supabase as any)
        .from('notas_fiscais_compra')
        .update({ status: 'Pendente' })
        .eq('id', nota.id);
      if (e1) throw e1;

      await (supabase as any).from('notas_fiscais_compra_historico').insert({
        nota_id:         nota.id,
        status_anterior: nota.status,
        status_novo:     'Pendente',
        observacao:      null,
        feito_por:       user?.id ?? null,
        feito_por_nome:  nome || username || user?.email || null,
      });

      toast.success('Nota voltou para Pendente');
      setNotas((prev) => prev.map((n) => n.id === nota.id ? { ...n, status: 'Pendente' } : n));
      setHistory((prev) => { const next = { ...prev }; delete next[nota.id]; return next; });
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  // ── delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingId) return;
    const nota = notas.find((n) => n.id === deletingId);
    if (!nota) return;
    setDeleteLoading(true);
    try {
      // 1. Remove storage files (best effort — don't block on errors)
      const filePaths = [nota.nf_path, nota.boleto_path, nota.mercadoria_path].filter(Boolean) as string[];
      if (filePaths.length > 0) {
        await supabase.storage.from('documentos-comprovantes').remove(filePaths);
      }

      // 2. If linked to a pedido, revert it to Aguardando Entrega + insert historico
      if (nota.pedido_id) {
        const now = new Date().toISOString();
        await (supabase as any)
          .from('pedidos_compra')
          .update({ status: 'Aguardando Entrega', updated_at: now })
          .eq('id', nota.pedido_id);
        await (supabase as any).from('pedidos_compra_historico').insert({
          pedido_id:       nota.pedido_id,
          status_anterior: 'Recebido',
          status_novo:     'Aguardando Entrega',
          observacao:      'Nota fiscal de compra excluída',
          feito_por:       user?.id ?? null,
          feito_por_nome:  nome || username || user?.email || null,
        });
      }

      // 3. Delete historico rows (ON DELETE CASCADE should handle it, but be explicit)
      await (supabase as any)
        .from('notas_fiscais_compra_historico')
        .delete()
        .eq('nota_id', deletingId);

      // 4. Delete the nota
      const { error } = await (supabase as any)
        .from('notas_fiscais_compra')
        .delete()
        .eq('id', deletingId);
      if (error) throw error;

      toast.success('Nota excluída com sucesso');
      setNotas((prev) => prev.filter((n) => n.id !== deletingId));
      setDeletingId(null);
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  if (!selectedPostoId && allPostos.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Selecione um posto para continuar.
      </p>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Lançamento de Notas</h1>
        <span className="text-sm text-muted-foreground">
          {filtered.length} nota{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Date filter */}
      <DateFilter
        preset={dfPreset}
        range={dfRange}
        onChange={setDfPreset}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {showPostoFilter && (
          <Select
            value={filterPostoId || '__all__'}
            onValueChange={(v) => setFilterPostoId(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-[200px] text-sm">
              <SelectValue placeholder="Todos os postos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os postos</SelectItem>
              {allPostos.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filterStatus || '__all__'}
          onValueChange={(v) => setFilterStatus(v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="h-9 w-[160px] text-sm">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            <SelectItem value="Pendente">Pendente</SelectItem>
            <SelectItem value="Lançado">Lançado</SelectItem>
            <SelectItem value="Divergência">Divergência</SelectItem>
            <SelectItem value="Cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar fornecedor..."
          value={searchFornecedor}
          onChange={(e) => setSearchFornecedor(e.target.value)}
          className="h-9 w-[200px] text-sm"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          {loadingData ? (
            <p className="text-center text-muted-foreground text-sm py-6">Carregando...</p>
          ) : pagination.paginatedData.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">
              Nenhuma nota fiscal encontrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 px-2" />
                  <TableHead className="text-xs whitespace-nowrap">Data de Chegada</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Enviado em</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Fornecedor</TableHead>
                  {showPostoFilter && <TableHead className="text-xs whitespace-nowrap">Posto</TableHead>}
                  <TableHead className="text-xs whitespace-nowrap">Enviado por</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Pedido</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Arquivos</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Observações</TableHead>
                  <TableHead className="w-10 px-2" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedData.map((nota) => (
                  <>
                    {/* Main row */}
                    <TableRow key={nota.id}>
                      {/* Expand history */}
                      <TableCell className="px-2">
                        <button
                          className="p-1 rounded hover:bg-muted"
                          onClick={() => toggleHistory(nota.id)}
                          title={expandedId === nota.id ? 'Fechar histórico' : 'Ver histórico'}
                        >
                          {expandedId === nota.id ? (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </button>
                      </TableCell>

                      <TableCell className="text-xs whitespace-nowrap px-3">
                        {nota.data_chegada ? formatDate(nota.data_chegada) : <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      <TableCell className="text-xs whitespace-nowrap px-3 text-muted-foreground">
                        {formatDate(nota.created_at)}
                      </TableCell>

                      <TableCell className="text-xs font-medium px-3 whitespace-nowrap">
                        {nota.fornecedor}
                      </TableCell>

                      {showPostoFilter && (
                        <TableCell className="text-xs px-3 whitespace-nowrap">
                          {postoNome(nota.posto_id)}
                        </TableCell>
                      )}

                      <TableCell className="text-xs px-3 whitespace-nowrap text-muted-foreground">
                        {nota.enviado_por_nome || '—'}
                      </TableCell>

                      {/* Pedido vinculado */}
                      <TableCell className="text-xs px-3 whitespace-nowrap">
                        {nota.pedidos_compra ? (
                          <span className="font-medium text-primary">
                            {nota.pedidos_compra.numero ? `#${nota.pedidos_compra.numero}` : 'S/N'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Sem pedido</span>
                        )}
                      </TableCell>

                      {/* File previews */}
                      <TableCell className="px-3">
                        <div className="flex items-center gap-1">
                          {nota.nf_path ? (
                            <FilePreviewButton
                              path={nota.nf_path}
                              type={nota.nf_type}
                              label="Nota Fiscal"
                              onOpen={setPreviewFile}
                            />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">sem NF</span>
                          )}
                          {nota.boleto_path ? (
                            <FilePreviewButton
                              path={nota.boleto_path}
                              type={nota.boleto_type}
                              label="Boleto"
                              onOpen={setPreviewFile}
                            />
                          ) : (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                              title="Sem boleto anexado"
                            >
                              <AlertCircle className="w-3 h-3" />
                              sem boleto
                            </span>
                          )}
                          {nota.mercadoria_path ? (
                            <FilePreviewButton
                              path={nota.mercadoria_path}
                              type={nota.mercadoria_type}
                              label="Mercadoria"
                              onOpen={setPreviewFile}
                            />
                          ) : (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"
                              title="Sem foto da mercadoria"
                            >
                              <AlertCircle className="w-3 h-3" />
                              sem foto
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="px-3">
                        <StatusBadge status={nota.status} />
                      </TableCell>

                      <TableCell className="text-xs px-3 max-w-[160px] truncate text-muted-foreground">
                        {nota.observacoes || '—'}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="px-2">
                        <div className="flex items-center gap-0.5">
                        {role === 'admin' && (
                          <button
                            className="p-1 rounded hover:bg-destructive/10 text-destructive"
                            onClick={() => setDeletingId(nota.id)}
                            title="Excluir nota"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-sm">
                            {nota.status !== 'Lançado' && (
                              <DropdownMenuItem
                                className="text-green-700 focus:text-green-700"
                                onClick={() => openStatusDialog(nota, 'Lançado')}
                              >
                                ✓ Marcar como Lançado
                              </DropdownMenuItem>
                            )}
                            {nota.status !== 'Divergência' && nota.status !== 'Cancelado' && (
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => openStatusDialog(nota, 'Divergência')}
                              >
                                ✗ Marcar como Divergência
                              </DropdownMenuItem>
                            )}
                            {nota.status !== 'Cancelado' && (
                              <DropdownMenuItem
                                className="text-muted-foreground focus:text-muted-foreground"
                                onClick={() => openStatusDialog(nota, 'Cancelado')}
                              >
                                Cancelar nota
                              </DropdownMenuItem>
                            )}
                            {nota.status !== 'Pendente' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => revertToPendente(nota)}>
                                  ↩ Voltar para Pendente
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Expanded history row */}
                    {expandedId === nota.id && (
                      <TableRow key={`${nota.id}-history`} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell
                          colSpan={showPostoFilter ? 11 : 10}
                          className="px-6 py-3"
                        >
                          <div className="space-y-3">
                            {/* Pedido vinculado */}
                            {nota.pedidos_compra && (
                              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
                                <p className="font-medium text-muted-foreground mb-1">Pedido vinculado</p>
                                <p><span className="text-muted-foreground">Número:</span> {nota.pedidos_compra.numero || 'S/N'}</p>
                                {nota.pedidos_compra.fornecedor && (
                                  <p><span className="text-muted-foreground">Fornecedor:</span> {nota.pedidos_compra.fornecedor}</p>
                                )}
                              </div>
                            )}
                            {/* Histórico */}
                            {loadingHistory === nota.id ? (
                              <p className="text-xs text-muted-foreground">Carregando histórico...</p>
                            ) : !history[nota.id] || history[nota.id].length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhum histórico registrado.</p>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Histórico</p>
                                {history[nota.id].map((h) => (
                                  <HistoricoItem key={h.id} h={h} />
                                ))}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalItems > 0 && (
        <PaginationControls
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.handlePageSizeChange}
        />
      )}

      {/* Status change dialog */}
      <Dialog open={!!statusDialog} onOpenChange={() => setStatusDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusDialog?.target === 'Lançado' && 'Marcar como Lançado'}
              {statusDialog?.target === 'Divergência' && 'Marcar como Divergência'}
              {statusDialog?.target === 'Cancelado' && 'Cancelar Nota'}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              {statusDialog?.target === 'Lançado' && (
                <>Confirma que a nota de <strong>{statusDialog?.nota.fornecedor}</strong> foi lançada?</>
              )}
              {statusDialog?.target === 'Divergência' && (
                <>Descreva a divergência encontrada na nota de <strong>{statusDialog?.nota.fornecedor}</strong>.</>
              )}
              {statusDialog?.target === 'Cancelado' && (
                <>Informe o motivo do cancelamento da nota de <strong>{statusDialog?.nota.fornecedor}</strong>.</>
              )}
            </p>

            <div className="space-y-1">
              <Label className="text-xs">
                Observação
                {obsRequired(statusDialog?.target as StatusNota) && ' *'}
              </Label>
              <Textarea
                value={statusObs}
                onChange={(e) => setStatusObs(e.target.value)}
                placeholder={
                  statusDialog?.target === 'Divergência'
                    ? 'Ex: Valor da nota não confere com o pedido...'
                    : statusDialog?.target === 'Cancelado'
                    ? 'Ex: Nota duplicada, fornecedor cancelou...'
                    : 'Observação opcional...'
                }
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStatusDialog(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={confirmStatusChange}
              disabled={statusLoading || (obsRequired(statusDialog?.target as StatusNota) && !statusObs.trim())}
              className={
                statusDialog?.target === 'Lançado' ? 'bg-green-600 hover:bg-green-700' :
                statusDialog?.target === 'Divergência' ? 'bg-red-500 hover:bg-red-600' :
                ''
              }
            >
              {statusLoading ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir nota fiscal</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Tem certeza que deseja excluir esta nota? Esta ação não pode ser desfeita.</p>
                {deletingId && notas.find((n) => n.id === deletingId)?.pedido_id && (
                  <p className="text-amber-600 font-medium text-sm">
                    Esta nota está vinculada a um pedido — o pedido voltará para "Aguardando Entrega".
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteLoading}
            >
              {deleteLoading ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview modal */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl p-2">
          {previewFile && (
            <>
              {previewFile.type === 'image' ? (
                <img src={previewFile.url} className="w-full rounded" alt={previewFile.label} />
              ) : isMobile ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 bg-muted/30 rounded">
                  <FileText className="w-14 h-14 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground text-center px-4">
                    Pré-visualização de PDF não disponível no celular.
                  </p>
                  <a href={previewFile.url} target="_blank" rel="noreferrer">
                    <Button className="gap-2">
                      <ExternalLink className="w-4 h-4" />
                      Abrir PDF
                    </Button>
                  </a>
                </div>
              ) : (
                <iframe
                  src={previewFile.url}
                  className="w-full h-[70vh] rounded"
                  title={previewFile.label}
                />
              )}
              <div className="flex items-center justify-between pt-1 px-1">
                <span className="text-xs text-muted-foreground">{previewFile.label}</span>
                <a href={previewFile.url} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir em nova aba
                  </Button>
                </a>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
