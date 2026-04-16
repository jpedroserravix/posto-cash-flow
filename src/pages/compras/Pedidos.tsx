import { useState, useEffect, useMemo, useRef } from 'react';
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
  Plus, Pencil, Trash2, ChevronDown, ChevronRight, MoreHorizontal,
  Paperclip, ExternalLink, FileText, X, Save,
} from 'lucide-react';

// ─── types ──────────────────────────────────────────────────────────────────

type StatusPedido = 'Aguardando Entrega' | 'Recebido' | 'Divergência' | 'Cancelado';

interface Pedido {
  id: string;
  posto_id: string;
  numero: string | null;
  fornecedor: string | null;
  observacoes: string | null;
  arquivo_path: string | null;
  arquivo_type: string | null;
  status: StatusPedido;
  criado_por: string | null;
  criado_por_nome: string | null;
  created_at: string;
  updated_at: string;
}

interface PedidoHistorico {
  id: string;
  pedido_id: string;
  status_anterior: string | null;
  status_novo: string;
  observacao: string | null;
  feito_por: string | null;
  feito_por_nome: string | null;
  created_at: string;
}

interface NotaVinculada {
  id: string;
  fornecedor: string;
  data_chegada: string | null;
  status: string;
}

interface PreviewFile {
  url: string;
  label: string;
  type: 'image' | 'pdf';
}

interface PedidoFormState {
  posto_id: string;
  numero: string;
  fornecedor: string;
  observacoes: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function getPublicUrl(path: string) {
  return supabase.storage.from('documentos-comprovantes').getPublicUrl(path).data.publicUrl;
}

const EMPTY_FORM: PedidoFormState = { posto_id: '', numero: '', fornecedor: '', observacoes: '' };

// ─── sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StatusPedido }) {
  const cls: Record<StatusPedido, string> = {
    'Aguardando Entrega': 'bg-yellow-500 hover:bg-yellow-500 text-white',
    'Recebido':           'bg-green-600 hover:bg-green-600 text-white',
    'Divergência':        'bg-red-500 hover:bg-red-500 text-white',
    'Cancelado':          'bg-gray-400 hover:bg-gray-400 text-white',
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
  const isImg = type === 'image';
  const url = getPublicUrl(path);
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button
          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
          onClick={() => onOpen({ url, label, type: isImg ? 'image' : 'pdf' })}
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

function HistoricoItem({ h }: { h: PedidoHistorico }) {
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

export default function Pedidos() {
  const { user, nome, username, allPostos, selectedPostoId } = useAuth();
  const showPostoFilter = allPostos.length > 0;

  const { preset: dfPreset, range: dfRange, setPreset: setDfPreset } = useDateFilter('thisMonth');

  const [pedidos, setPedidos]         = useState<Pedido[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // filters
  const [filterPostoId, setFilterPostoId] = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [searchText, setSearchText]       = useState('');

  // expand / history / linked nota
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [history, setHistory]           = useState<Record<string, PedidoHistorico[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);
  const [linkedNotas, setLinkedNotas]   = useState<Record<string, NotaVinculada | null>>({});

  // form (create / edit)
  const [formOpen, setFormOpen]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState<PedidoFormState>(EMPTY_FORM);
  const [formFile, setFormFile]     = useState<File | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // status change dialog
  const [statusDialog, setStatusDialog] = useState<{ pedido: Pedido; target: StatusPedido } | null>(null);
  const [statusObs, setStatusObs]       = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  // preview modal
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // ── helpers ────────────────────────────────────────────────────────────────
  const autoPostoId = showPostoFilter ? '' : (selectedPostoId || '');
  const postoNomeMap = useMemo(() => {
    const m: Record<string, string> = {};
    allPostos.forEach((p) => { m[p.id] = p.nome; });
    return m;
  }, [allPostos]);

  // ── data loading ───────────────────────────────────────────────────────────
  useEffect(() => { loadPedidos(); }, [selectedPostoId, allPostos, dfRange.start, dfRange.end]);

  const loadPedidos = async () => {
    setLoadingData(true);
    try {
      let query = (supabase as any)
        .from('pedidos_compra')
        .select('*')
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
      setPedidos((data || []) as Pedido[]);
    } finally {
      setLoadingData(false);
    }
  };

  const loadHistory = async (pedidoId: string) => {
    if (history[pedidoId]) return;
    setLoadingHistory(pedidoId);
    const { data, error } = await (supabase as any)
      .from('pedidos_compra_historico')
      .select('*')
      .eq('pedido_id', pedidoId)
      .order('created_at', { ascending: true });
    if (!error && data) setHistory((prev) => ({ ...prev, [pedidoId]: data as PedidoHistorico[] }));
    setLoadingHistory(null);
  };

  const loadLinkedNota = async (pedidoId: string) => {
    if (pedidoId in linkedNotas) return;
    const { data } = await (supabase as any)
      .from('notas_fiscais_compra')
      .select('id, fornecedor, data_chegada, status')
      .eq('pedido_id', pedidoId)
      .maybeSingle();
    setLinkedNotas((prev) => ({ ...prev, [pedidoId]: data as NotaVinculada | null }));
  };

  const toggleExpand = (pedidoId: string, status: StatusPedido) => {
    if (expandedId === pedidoId) {
      setExpandedId(null);
    } else {
      setExpandedId(pedidoId);
      loadHistory(pedidoId);
      if (status === 'Recebido') loadLinkedNota(pedidoId);
    }
  };

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, posto_id: autoPostoId });
    setFormFile(null);
    setFormOpen(true);
  };

  const openEdit = (p: Pedido) => {
    setEditingId(p.id);
    setForm({
      posto_id:    p.posto_id,
      numero:      p.numero || '',
      fornecedor:  p.fornecedor || '',
      observacoes: p.observacoes || '',
    });
    setFormFile(null);
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    const postoId = form.posto_id || autoPostoId;
    if (!postoId) { toast.error('Selecione o posto'); return; }
    setFormLoading(true);
    try {
      let arquivo_path: string | null = null;
      let arquivo_type: string | null = null;
      if (formFile) {
        const safe = formFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `pedidos/${postoId}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from('documentos-comprovantes')
          .upload(path, formFile, { upsert: false, contentType: formFile.type });
        if (upErr) throw upErr;
        arquivo_path = path;
        arquivo_type = formFile.type.startsWith('image/') ? 'image' : 'pdf';
      }

      const record: any = {
        posto_id:    postoId,
        numero:      form.numero || null,
        fornecedor:  form.fornecedor || null,
        observacoes: form.observacoes || null,
        ...(arquivo_path ? { arquivo_path, arquivo_type } : {}),
      };

      if (editingId) {
        const { error } = await (supabase as any).from('pedidos_compra').update(record).eq('id', editingId);
        if (error) throw error;
        toast.success('Pedido atualizado');
      } else {
        record.criado_por      = user?.id ?? null;
        record.criado_por_nome = nome || username || user?.email || null;
        const { data: inserted, error } = await (supabase as any)
          .from('pedidos_compra')
          .insert(record)
          .select('id')
          .single();
        if (error) throw error;
        // Insert initial history entry
        await (supabase as any).from('pedidos_compra_historico').insert({
          pedido_id:       inserted.id,
          status_anterior: null,
          status_novo:     'Aguardando Entrega',
          observacao:      null,
          feito_por:       user?.id ?? null,
          feito_por_nome:  nome || username || user?.email || null,
        });
        toast.success('Pedido criado');
      }

      setFormOpen(false);
      loadPedidos();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await (supabase as any).from('pedidos_compra').delete().eq('id', deletingId);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Pedido excluído');
    setDeletingId(null);
    loadPedidos();
  };

  // ── status change ──────────────────────────────────────────────────────────
  const obsRequired = (target: StatusPedido) =>
    target === 'Divergência' || target === 'Cancelado';

  const openStatusDialog = (pedido: Pedido, target: StatusPedido) => {
    setStatusObs('');
    setStatusDialog({ pedido, target });
  };

  const confirmStatusChange = async () => {
    if (!statusDialog) return;
    const { pedido, target } = statusDialog;
    if (obsRequired(target) && !statusObs.trim()) {
      toast.error('A observação é obrigatória para este status.');
      return;
    }
    setStatusLoading(true);
    try {
      const now = new Date().toISOString();
      const { error: e1 } = await (supabase as any)
        .from('pedidos_compra')
        .update({ status: target, updated_at: now })
        .eq('id', pedido.id);
      if (e1) throw e1;

      const { error: e2 } = await (supabase as any)
        .from('pedidos_compra_historico')
        .insert({
          pedido_id:       pedido.id,
          status_anterior: pedido.status,
          status_novo:     target,
          observacao:      statusObs.trim() || null,
          feito_por:       user?.id ?? null,
          feito_por_nome:  nome || username || user?.email || null,
        });
      if (e2) throw e2;

      toast.success(`Status alterado para "${target}"`);
      setPedidos((prev) => prev.map((p) => p.id === pedido.id ? { ...p, status: target } : p));
      setHistory((prev) => { const next = { ...prev }; delete next[pedido.id]; return next; });
      setStatusDialog(null);
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setStatusLoading(false);
    }
  };

  const revertToAguardando = async (pedido: Pedido) => {
    try {
      const now = new Date().toISOString();
      await (supabase as any)
        .from('pedidos_compra')
        .update({ status: 'Aguardando Entrega', updated_at: now })
        .eq('id', pedido.id);
      await (supabase as any).from('pedidos_compra_historico').insert({
        pedido_id:       pedido.id,
        status_anterior: pedido.status,
        status_novo:     'Aguardando Entrega',
        observacao:      null,
        feito_por:       user?.id ?? null,
        feito_por_nome:  nome || username || user?.email || null,
      });
      toast.success('Pedido voltou para Aguardando Entrega');
      setPedidos((prev) => prev.map((p) => p.id === pedido.id ? { ...p, status: 'Aguardando Entrega' } : p));
      setHistory((prev) => { const next = { ...prev }; delete next[pedido.id]; return next; });
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  // ── derived / filtered ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...pedidos];
    if (filterPostoId) list = list.filter((p) => p.posto_id === filterPostoId);
    if (filterStatus)  list = list.filter((p) => p.status === filterStatus);
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter((p) =>
        (p.fornecedor || '').toLowerCase().includes(q) ||
        (p.numero || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [pedidos, filterPostoId, filterStatus, searchText]);

  const pagination = usePagination(
    filtered,
    [filterPostoId, filterStatus, searchText, dfRange.start, dfRange.end],
    { defaultPageSize: 20, sessionKey: 'pedidos_compra_pageSize' },
  );

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
        <h1 className="text-xl font-bold">Pedidos de Compra</h1>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" />Novo Pedido
        </Button>
      </div>

      {/* Date filter */}
      <DateFilter preset={dfPreset} range={dfRange} onChange={setDfPreset} />

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
          <SelectTrigger className="h-9 w-[190px] text-sm">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            <SelectItem value="Aguardando Entrega">Aguardando Entrega</SelectItem>
            <SelectItem value="Recebido">Recebido</SelectItem>
            <SelectItem value="Divergência">Divergência</SelectItem>
            <SelectItem value="Cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Buscar fornecedor ou número..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="h-9 w-[220px] text-sm"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          {loadingData ? (
            <p className="text-center text-muted-foreground text-sm py-6">Carregando...</p>
          ) : pagination.paginatedData.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-6">
              Nenhum pedido encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 px-2" />
                  <TableHead className="text-xs whitespace-nowrap">Número</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Fornecedor</TableHead>
                  {showPostoFilter && <TableHead className="text-xs whitespace-nowrap">Posto</TableHead>}
                  <TableHead className="text-xs whitespace-nowrap">Criado em</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Criado por</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">PDF</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                  <TableHead className="w-10 px-2" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedData.map((pedido) => (
                  <>
                    <TableRow key={pedido.id}>
                      {/* Expand */}
                      <TableCell className="px-2">
                        <button
                          className="p-1 rounded hover:bg-muted"
                          onClick={() => toggleExpand(pedido.id, pedido.status)}
                          title={expandedId === pedido.id ? 'Fechar' : 'Ver histórico'}
                        >
                          {expandedId === pedido.id
                            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        </button>
                      </TableCell>

                      <TableCell className="text-xs font-mono px-3 whitespace-nowrap">
                        {pedido.numero || <span className="text-muted-foreground">S/N</span>}
                      </TableCell>

                      <TableCell className="text-xs font-medium px-3 whitespace-nowrap">
                        {pedido.fornecedor || <span className="text-muted-foreground">—</span>}
                      </TableCell>

                      {showPostoFilter && (
                        <TableCell className="text-xs px-3 whitespace-nowrap">
                          {postoNomeMap[pedido.posto_id] || '—'}
                        </TableCell>
                      )}

                      <TableCell className="text-xs px-3 whitespace-nowrap text-muted-foreground">
                        {formatDate(pedido.created_at)}
                      </TableCell>

                      <TableCell className="text-xs px-3 whitespace-nowrap text-muted-foreground">
                        {pedido.criado_por_nome || '—'}
                      </TableCell>

                      <TableCell className="px-3">
                        {pedido.arquivo_path ? (
                          <FilePreviewButton
                            path={pedido.arquivo_path}
                            type={pedido.arquivo_type}
                            label="PDF do Pedido"
                            onOpen={setPreviewFile}
                          />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">sem PDF</span>
                        )}
                      </TableCell>

                      <TableCell className="px-3">
                        <StatusBadge status={pedido.status} />
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="px-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-sm">
                            <DropdownMenuItem onClick={() => openEdit(pedido)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" />Editar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {pedido.status !== 'Recebido' && (
                              <DropdownMenuItem
                                className="text-green-700 focus:text-green-700"
                                onClick={() => openStatusDialog(pedido, 'Recebido')}
                              >
                                ✓ Marcar como Recebido
                              </DropdownMenuItem>
                            )}
                            {pedido.status !== 'Divergência' && pedido.status !== 'Cancelado' && (
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => openStatusDialog(pedido, 'Divergência')}
                              >
                                ✗ Marcar como Divergência
                              </DropdownMenuItem>
                            )}
                            {pedido.status !== 'Cancelado' && (
                              <DropdownMenuItem
                                className="text-muted-foreground focus:text-muted-foreground"
                                onClick={() => openStatusDialog(pedido, 'Cancelado')}
                              >
                                Cancelar pedido
                              </DropdownMenuItem>
                            )}
                            {pedido.status !== 'Aguardando Entrega' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => revertToAguardando(pedido)}>
                                  ↩ Voltar para Aguardando
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeletingId(pedido.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {/* Expanded row */}
                    {expandedId === pedido.id && (
                      <TableRow key={`${pedido.id}-expand`} className="bg-muted/40 hover:bg-muted/40">
                        <TableCell
                          colSpan={showPostoFilter ? 9 : 8}
                          className="px-6 py-3"
                        >
                          <div className="space-y-3">
                            {/* Observações */}
                            {pedido.observacoes && (
                              <div className="text-xs">
                                <span className="text-muted-foreground font-medium">Observações: </span>
                                {pedido.observacoes}
                              </div>
                            )}

                            {/* NF vinculada (quando Recebido) */}
                            {pedido.status === 'Recebido' && (
                              <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-0.5">
                                <p className="font-medium text-muted-foreground mb-1">Nota Fiscal vinculada</p>
                                {!(pedido.id in linkedNotas) ? (
                                  <p className="text-muted-foreground">Carregando...</p>
                                ) : linkedNotas[pedido.id] ? (
                                  <>
                                    <p>
                                      <span className="text-muted-foreground">Fornecedor:</span>{' '}
                                      {linkedNotas[pedido.id]!.fornecedor}
                                    </p>
                                    {linkedNotas[pedido.id]!.data_chegada && (
                                      <p>
                                        <span className="text-muted-foreground">Chegada:</span>{' '}
                                        {formatDate(linkedNotas[pedido.id]!.data_chegada!)}
                                      </p>
                                    )}
                                    <p>
                                      <span className="text-muted-foreground">Status NF:</span>{' '}
                                      {linkedNotas[pedido.id]!.status}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-muted-foreground">
                                    Nenhuma NF vinculada encontrada.
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Histórico */}
                            {loadingHistory === pedido.id ? (
                              <p className="text-xs text-muted-foreground">Carregando histórico...</p>
                            ) : !history[pedido.id] || history[pedido.id].length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhum histórico registrado.</p>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">Histórico</p>
                                {history[pedido.id].map((h) => (
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

      {/* Form dialog (create / edit) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Pedido' : 'Novo Pedido'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {/* Posto */}
            {showPostoFilter && (
              <div>
                <Label className="text-xs">Posto *</Label>
                <Select
                  value={form.posto_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, posto_id: v }))}
                >
                  <SelectTrigger className="h-9 text-sm mt-1">
                    <SelectValue placeholder="Selecionar posto" />
                  </SelectTrigger>
                  <SelectContent>
                    {allPostos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Número do Pedido</Label>
              <Input
                value={form.numero}
                onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))}
                placeholder="Ex: 2600001-01"
                className="h-9 mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Fornecedor / Razão Social</Label>
              <Input
                value={form.fornecedor}
                onChange={(e) => setForm((f) => ({ ...f, fornecedor: e.target.value }))}
                placeholder="Ex: MULTILUB DISTRIBUIDORA"
                className="h-9 mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                placeholder="Informações adicionais..."
                className="mt-1 text-sm resize-none"
                rows={2}
              />
            </div>
            {/* File */}
            <div>
              <Label className="text-xs">PDF / Imagem do Pedido</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && setFormFile(e.target.files[0])}
              />
              {formFile ? (
                <div className="mt-1 flex items-center gap-2 rounded border p-2 text-xs">
                  {formFile.type.startsWith('image/') ? (
                    <img
                      src={URL.createObjectURL(formFile)}
                      className="h-10 w-10 rounded object-cover shrink-0"
                      alt=""
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-muted shrink-0">
                      <FileText className="h-5 w-5 text-red-500" />
                    </div>
                  )}
                  <span className="flex-1 truncate">{formFile.name}</span>
                  <button onClick={() => { setFormFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                    <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 w-full"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="w-3.5 h-3.5 mr-1.5" />
                  Anexar arquivo
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSubmit} disabled={formLoading}>
              <Save className="w-3.5 h-3.5 mr-1" />
              {formLoading ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status change dialog */}
      <Dialog open={!!statusDialog} onOpenChange={() => setStatusDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusDialog?.target === 'Recebido'    && 'Marcar como Recebido'}
              {statusDialog?.target === 'Divergência' && 'Marcar como Divergência'}
              {statusDialog?.target === 'Cancelado'   && 'Cancelar Pedido'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              {statusDialog?.target === 'Recebido' && (
                <>Confirmar recebimento do pedido{statusDialog?.pedido.numero ? ` #${statusDialog.pedido.numero}` : ''}?</>
              )}
              {statusDialog?.target === 'Divergência' && (
                <>Descreva a divergência encontrada no pedido{statusDialog?.pedido.numero ? ` #${statusDialog.pedido.numero}` : ''}.</>
              )}
              {statusDialog?.target === 'Cancelado' && (
                <>Informe o motivo do cancelamento do pedido{statusDialog?.pedido.numero ? ` #${statusDialog.pedido.numero}` : ''}.</>
              )}
            </p>
            <div className="space-y-1">
              <Label className="text-xs">
                Observação{obsRequired(statusDialog?.target as StatusPedido) && ' *'}
              </Label>
              <Textarea
                value={statusObs}
                onChange={(e) => setStatusObs(e.target.value)}
                placeholder={
                  statusDialog?.target === 'Divergência' ? 'Ex: Quantidade divergente do pedido...' :
                  statusDialog?.target === 'Cancelado'   ? 'Ex: Pedido cancelado pelo fornecedor...' :
                  'Observação opcional...'
                }
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStatusDialog(null)}>Cancelar</Button>
            <Button
              size="sm"
              onClick={confirmStatusChange}
              disabled={statusLoading || (obsRequired(statusDialog?.target as StatusPedido) && !statusObs.trim())}
              className={
                statusDialog?.target === 'Recebido'    ? 'bg-green-600 hover:bg-green-700' :
                statusDialog?.target === 'Divergência' ? 'bg-red-500 hover:bg-red-600' : ''
              }
            >
              {statusLoading ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Este pedido será excluído permanentemente, incluindo seu histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Excluir
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
              ) : (
                <iframe src={previewFile.url} className="w-full h-[70vh] rounded" title={previewFile.label} />
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
