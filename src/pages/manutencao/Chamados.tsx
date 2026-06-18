import { useState, useEffect, useMemo, useRef } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useListaConfig } from '@/hooks/useListaConfig';
import { useIsMobile } from '@/hooks/use-mobile';
import { openInNewTab } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Plus, Wrench, Pencil, Trash2, Paperclip, X, ImagePlus,
  History, ChevronDown, MoveRight, User, DollarSign,
} from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

type ChamadoStatus = 'aberto' | 'em_andamento' | 'concluido';

interface Chamado {
  id: string;
  posto_id: string;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  prioridade: string;
  status: ChamadoStatus;
  responsavel_nome: string | null;
  custo: string | number | null;
  foto_path: string | null;
  foto_name: string | null;
  foto_type: string | null;
  criado_por_nome: string | null;
  concluido_em: string | null;
  created_at: string;
  postos: { nome: string } | null;
}

interface ChamadoHistorico {
  id: string;
  chamado_id: string;
  status_anterior: string | null;
  status_novo: string;
  alterado_por_nome: string | null;
  observacao: string | null;
  created_at: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const STATUSES: { value: ChamadoStatus; label: string }[] = [
  { value: 'aberto',       label: 'Aberto' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido',    label: 'Concluído' },
];

const PRIORIDADES = [
  { value: 'baixa',    label: 'Baixa' },
  { value: 'media',    label: 'Média' },
  { value: 'alta',     label: 'Alta' },
  { value: 'urgente',  label: 'Urgente' },
];

const EMPTY_FORM = {
  titulo:           '',
  posto_id:         '',
  categoria:        '__none__',
  prioridade:       'media',
  descricao:        '',
  responsavel_nome: '',
  custo:            '',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusLabel(s: string) {
  return STATUSES.find((x) => x.value === s)?.label ?? s;
}

function prioridadeLabel(p: string) {
  return PRIORIDADES.find((x) => x.value === p)?.label ?? p;
}

function prioridadeClass(p: string): string {
  if (p === 'urgente') return 'bg-red-500 text-white';
  if (p === 'alta')    return 'bg-yellow-500 text-white';
  if (p === 'media')   return 'bg-blue-500 text-white';
  return 'bg-gray-400 text-white';
}

function formatCusto(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '';
  const n = parseFloat(String(v));
  if (isNaN(n)) return '';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getPhotoUrl(path: string) {
  return supabase.storage.from('manutencao').getPublicUrl(path).data.publicUrl;
}

// ─── KanbanColumn ────────────────────────────────────────────────────────────

function KanbanColumn({
  status,
  label,
  count,
  children,
}: {
  status: ChamadoStatus;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  const headerColor =
    status === 'aberto'       ? 'border-t-yellow-500' :
    status === 'em_andamento' ? 'border-t-blue-500' :
                                 'border-t-green-600';

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 min-h-[200px] rounded-lg bg-muted/40 border border-border p-3 transition-colors ${isOver ? 'bg-muted/70 ring-2 ring-primary/30' : ''}`}
    >
      <div className={`flex items-center justify-between border-t-2 ${headerColor} pt-2 -mt-1 mb-1`}>
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">{count}</span>
      </div>
      {children}
    </div>
  );
}

// ─── ChamadoCard ─────────────────────────────────────────────────────────────

function ChamadoCard({
  chamado,
  onEdit,
  onDelete,
  onHistory,
  onMove,
  isDragging,
}: {
  chamado: Chamado;
  onEdit: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onMove: (status: ChamadoStatus) => void;
  isDragging?: boolean;
}) {
  const isMobile = useIsMobile();
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: chamado.id });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: 0.5 }
    : undefined;

  const hasFoto = !!chamado.foto_path;
  const isImage = chamado.foto_type?.startsWith('image');
  const fotoUrl = hasFoto ? getPhotoUrl(chamado.foto_path!) : null;

  const otherStatuses = STATUSES.filter((s) => s.value !== chamado.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card border border-border rounded-md p-3 space-y-2 shadow-sm select-none ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* drag handle area — only on desktop */}
      <div
        {...(!isMobile ? { ...listeners, ...attributes } : {})}
        className={!isMobile ? 'cursor-grab active:cursor-grabbing' : ''}
      >
        <div className="flex items-start justify-between gap-1">
          <span className="text-sm font-medium leading-tight flex-1">{chamado.titulo}</span>
          <Badge className={`text-[10px] shrink-0 ${prioridadeClass(chamado.prioridade)}`}>
            {prioridadeLabel(chamado.prioridade)}
          </Badge>
        </div>

        {chamado.categoria && (
          <p className="text-xs text-muted-foreground">{chamado.categoria}</p>
        )}
      </div>

      {/* meta row */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {chamado.postos?.nome && (
          <span className="truncate max-w-[120px]" title={chamado.postos.nome}>
            {chamado.postos.nome}
          </span>
        )}
        {chamado.responsavel_nome && (
          <span className="flex items-center gap-0.5">
            <User className="w-3 h-3" />{chamado.responsavel_nome}
          </span>
        )}
        {chamado.custo !== null && chamado.custo !== '' && (
          <span className="flex items-center gap-0.5">
            <DollarSign className="w-3 h-3" />{formatCusto(chamado.custo)}
          </span>
        )}
      </div>

      {/* actions row */}
      <div className="flex items-center gap-0.5 pt-0.5">
        {/* foto */}
        {hasFoto && (
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <button
                className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
                onClick={() => { if (isMobile || !isImage) openInNewTab(fotoUrl!); }}
                title="Ver foto"
              >
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </HoverCardTrigger>
            {!isMobile && (
              <HoverCardContent side="left" className="w-48 p-1">
                {isImage ? (
                  <img src={fotoUrl!} className="w-full rounded object-cover" alt="" />
                ) : (
                  <iframe src={fotoUrl!} className="w-full h-36 rounded" title="preview" />
                )}
              </HoverCardContent>
            )}
          </HoverCard>
        )}

        {/* mover */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground"
              title="Mover para..."
            >
              <MoveRight className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="text-xs">
            {otherStatuses.map((s) => (
              <DropdownMenuItem key={s.value} onClick={() => onMove(s.value)} className="text-xs gap-1.5">
                <ChevronDown className="w-3 h-3" />
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* histórico */}
        <button
          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground"
          onClick={onHistory}
          title="Histórico"
        >
          <History className="w-3.5 h-3.5" />
        </button>

        {/* editar */}
        <button
          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground"
          onClick={onEdit}
          title="Editar"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>

        {/* excluir */}
        <button
          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-red-500"
          onClick={onDelete}
          title="Excluir"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function Chamados() {
  const {
    selectedPostoId,
    postoId: singlePostoId,
    postoNome: singlePostoNome,
    allPostos,
    nome: authNome,
  } = useAuth();

  const categorias  = useListaConfig('categorias_manutencao', []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chamados,  setChamados]  = useState<Chamado[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [activeId,  setActiveId]  = useState<string | null>(null);

  // create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [saving,     setSaving]     = useState(false);

  // photo
  const [photoFile,         setPhotoFile]         = useState<File | null>(null);
  const [removePhoto,       setRemovePhoto]       = useState(false);
  const [existingPhotoPath, setExistingPhotoPath] = useState<string | null>(null);

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // history dialog
  const [histChamado, setHistChamado] = useState<Chamado | null>(null);
  const [histData,    setHistData]    = useState<ChamadoHistorico[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const postoOptions = useMemo(() => {
    if (allPostos.length > 0) return allPostos;
    if (singlePostoId) return [{ id: singlePostoId, nome: singlePostoNome ?? singlePostoId, cnpj: '' }];
    return [];
  }, [allPostos, singlePostoId, singlePostoNome]);

  // ── sensors ───────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // ── data ──────────────────────────────────────────────────────────────────

  useEffect(() => { load(); }, [selectedPostoId]);

  async function load() {
    if (!selectedPostoId) { setChamados([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('manutencao_chamados')
        .select('id, posto_id, titulo, descricao, categoria, prioridade, status, responsavel_nome, custo, foto_path, foto_name, foto_type, criado_por_nome, concluido_em, created_at, postos(nome)')
        .eq('posto_id', selectedPostoId)
        .order('created_at', { ascending: false });

      if (error) toast.error(`Erro ao carregar chamados: ${error.message}`);
      else setChamados((data as Chamado[]) || []);
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  // ── columns ───────────────────────────────────────────────────────────────

  const byStatus = useMemo(() => {
    const aberto       = chamados.filter((c) => c.status === 'aberto');
    const em_andamento = chamados.filter((c) => c.status === 'em_andamento');
    const concluido    = chamados.filter((c) => c.status === 'concluido');
    return { aberto, em_andamento, concluido };
  }, [chamados]);

  const activeCard = useMemo(
    () => chamados.find((c) => c.id === activeId) ?? null,
    [chamados, activeId],
  );

  // ── drag handlers ─────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as ChamadoStatus;
    const chamado   = chamados.find((c) => c.id === active.id);
    if (!chamado || chamado.status === newStatus) return;
    await moveStatus(chamado, newStatus);
  }

  // ── move status (shared by drag and button) ───────────────────────────────

  async function moveStatus(chamado: Chamado, newStatus: ChamadoStatus) {
    const oldStatus = chamado.status;
    const payload: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'concluido')  payload.concluido_em = new Date().toISOString();
    if (oldStatus === 'concluido')  payload.concluido_em = null;

    // optimistic update
    setChamados((prev) =>
      prev.map((c) => c.id === chamado.id ? { ...c, status: newStatus } : c)
    );

    const { error } = await (supabase as any)
      .from('manutencao_chamados')
      .update(payload)
      .eq('id', chamado.id);

    if (error) {
      toast.error(`Erro ao mover chamado: ${error.message}`);
      setChamados((prev) =>
        prev.map((c) => c.id === chamado.id ? { ...c, status: oldStatus } : c)
      );
      return;
    }

    await (supabase as any).from('manutencao_chamados_historico').insert({
      chamado_id:        chamado.id,
      status_anterior:   oldStatus,
      status_novo:       newStatus,
      alterado_por_nome: authNome ?? null,
      observacao:        null,
    });

    toast.success(`Chamado movido para "${statusLabel(newStatus)}"`);
  }

  // ── create/edit dialog ────────────────────────────────────────────────────

  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, posto_id: selectedPostoId ?? postoOptions[0]?.id ?? '' });
    setPhotoFile(null);
    setRemovePhoto(false);
    setExistingPhotoPath(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDialogOpen(true);
  }

  function openEdit(chamado: Chamado) {
    setEditId(chamado.id);
    setForm({
      titulo:           chamado.titulo,
      posto_id:         chamado.posto_id,
      categoria:        chamado.categoria ?? '__none__',
      prioridade:       chamado.prioridade,
      descricao:        chamado.descricao  ?? '',
      responsavel_nome: chamado.responsavel_nome ?? '',
      custo:            chamado.custo !== null && chamado.custo !== undefined
                          ? String(parseFloat(String(chamado.custo)) || '')
                          : '',
    });
    setPhotoFile(null);
    setRemovePhoto(false);
    setExistingPhotoPath(chamado.foto_path);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDialogOpen(true);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPhotoFile(f);
    if (f) setRemovePhoto(false);
  }

  function handleRemovePhoto() {
    setRemovePhoto(true);
    setPhotoFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast.error('Informe o título do chamado'); return; }
    if (!form.posto_id)      { toast.error('Selecione o posto'); return; }
    if (photoFile && photoFile.size > 10 * 1024 * 1024) {
      toast.error('Foto muito grande. Máximo 10 MB');
      return;
    }
    setSaving(true);

    let foto_path = existingPhotoPath;
    let foto_name: string | null = editId ? (chamados.find((c) => c.id === editId)?.foto_name ?? null) : null;
    let foto_type: string | null = editId ? (chamados.find((c) => c.id === editId)?.foto_type ?? null) : null;

    if ((photoFile || removePhoto) && existingPhotoPath) {
      await supabase.storage.from('manutencao').remove([existingPhotoPath]);
      foto_path = null; foto_name = null; foto_type = null;
    }

    if (photoFile) {
      const safeName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `chamados/${form.posto_id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('manutencao')
        .upload(path, photoFile, { contentType: photoFile.type });
      if (upErr) { toast.error('Erro ao enviar foto'); setSaving(false); return; }
      foto_path = path; foto_name = photoFile.name; foto_type = photoFile.type;
    }

    const custoNum = form.custo.trim() ? parseFloat(form.custo.replace(',', '.')) : null;

    const payload: Record<string, unknown> = {
      titulo:           form.titulo.trim(),
      posto_id:         form.posto_id,
      categoria:        form.categoria === '__none__' ? null : form.categoria,
      prioridade:       form.prioridade,
      descricao:        form.descricao.trim()        || null,
      responsavel_nome: form.responsavel_nome.trim() || null,
      custo:            isNaN(custoNum as number) ? null : custoNum,
      foto_path, foto_name, foto_type,
    };

    let error: any;
    if (editId) {
      ({ error } = await (supabase as any).from('manutencao_chamados').update(payload).eq('id', editId));
    } else {
      payload.criado_por_nome = authNome ?? null;
      payload.status          = 'aberto';
      ({ error } = await (supabase as any).from('manutencao_chamados').insert(payload));
    }

    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } else {
      toast.success(editId ? 'Chamado atualizado' : 'Chamado aberto');
      setDialogOpen(false);
      load();
    }
    setSaving(false);
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return;
    const chamado = chamados.find((c) => c.id === deleteId);
    if (chamado?.foto_path) {
      await supabase.storage.from('manutencao').remove([chamado.foto_path]);
    }
    const { error } = await (supabase as any)
      .from('manutencao_chamados')
      .delete()
      .eq('id', deleteId);
    if (error) {
      toast.error(`Erro ao excluir: ${error.message}`);
    } else {
      toast.success('Chamado excluído');
      setChamados((prev) => prev.filter((c) => c.id !== deleteId));
    }
    setDeleteId(null);
  }

  // ── history ───────────────────────────────────────────────────────────────

  async function openHistory(chamado: Chamado) {
    setHistChamado(chamado);
    setHistData([]);
    setHistLoading(true);
    const { data, error } = await (supabase as any)
      .from('manutencao_chamados_historico')
      .select('*')
      .eq('chamado_id', chamado.id)
      .order('created_at', { ascending: false });
    if (error) toast.error(`Erro ao carregar histórico: ${error.message}`);
    else setHistData((data as ChamadoHistorico[]) || []);
    setHistLoading(false);
  }

  // ── photo label for dialog ────────────────────────────────────────────────

  const dialogPhotoLabel = photoFile
    ? photoFile.name
    : removePhoto || !existingPhotoPath
    ? null
    : existingPhotoPath.split('/').pop() ?? existingPhotoPath;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Chamados</h1>
          <p className="text-sm text-muted-foreground">Gestão de manutenção por quadro Kanban</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openNew} disabled={!selectedPostoId}>
          <Plus className="w-4 h-4" />
          Novo Chamado
        </Button>
      </div>

      {/* Board */}
      {!selectedPostoId ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          Selecione um posto para visualizar os chamados.
        </div>
      ) : loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {STATUSES.map((col) => {
              const cards = byStatus[col.value as keyof typeof byStatus];
              return (
                <KanbanColumn key={col.value} status={col.value} label={col.label} count={cards.length}>
                  {cards.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-4">
                      Nenhum chamado
                    </p>
                  ) : (
                    cards.map((chamado) => (
                      <ChamadoCard
                        key={chamado.id}
                        chamado={chamado}
                        isDragging={chamado.id === activeId}
                        onEdit={() => openEdit(chamado)}
                        onDelete={() => setDeleteId(chamado.id)}
                        onHistory={() => openHistory(chamado)}
                        onMove={(s) => moveStatus(chamado, s)}
                      />
                    ))
                  )}
                </KanbanColumn>
              );
            })}
          </div>

          <DragOverlay>
            {activeCard && (
              <div className="bg-card border border-primary rounded-md p-3 shadow-xl w-64 opacity-95">
                <div className="flex items-start justify-between gap-1">
                  <span className="text-sm font-medium leading-tight flex-1">{activeCard.titulo}</span>
                  <Badge className={`text-[10px] shrink-0 ${prioridadeClass(activeCard.prioridade)}`}>
                    {prioridadeLabel(activeCard.prioridade)}
                  </Badge>
                </div>
                {activeCard.categoria && (
                  <p className="text-xs text-muted-foreground mt-1">{activeCard.categoria}</p>
                )}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!saving) setDialogOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              {editId ? 'Editar Chamado' : 'Novo Chamado'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Título <span className="text-red-500">*</span></Label>
              <Input
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Descreva o problema"
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Posto <span className="text-red-500">*</span></Label>
                {postoOptions.length <= 1 ? (
                  <Input value={postoOptions[0]?.nome ?? '—'} readOnly className="h-9 text-sm bg-muted" />
                ) : (
                  <Select value={form.posto_id} onValueChange={(v) => setForm((f) => ({ ...f, posto_id: v }))} disabled={saving}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {postoOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prioridade</Label>
                <Select value={form.prioridade} onValueChange={(v) => setForm((f) => ({ ...f, prioridade: v }))} disabled={saving}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))} disabled={saving}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem categoria</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Opcional"
                rows={2}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Responsável</Label>
                <Input
                  value={form.responsavel_nome}
                  onChange={(e) => setForm((f) => ({ ...f, responsavel_nome: e.target.value }))}
                  placeholder="Nome do responsável"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custo (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.custo}
                  onChange={(e) => setForm((f) => ({ ...f, custo: e.target.value }))}
                  placeholder="0,00"
                  disabled={saving}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Foto</Label>
              {dialogPhotoLabel ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded px-3 py-2">
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 truncate">{dialogPhotoLabel}</span>
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    disabled={saving}
                    className="hover:text-red-500 transition-colors"
                    title="Remover foto"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 border border-dashed rounded px-3 py-2 cursor-pointer text-xs text-muted-foreground hover:bg-muted/50 transition-colors ${saving ? 'opacity-50 pointer-events-none' : ''}`}>
                  <ImagePlus className="w-4 h-4 shrink-0" />
                  Selecionar foto (opcional)
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handlePhotoChange}
                    disabled={saving}
                  />
                </label>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Abrir chamado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── History Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={!!histChamado} onOpenChange={(v) => { if (!v) setHistChamado(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-4 h-4" />
              Histórico — {histChamado?.titulo}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            {histLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Carregando...</p>
            ) : histData.length === 0 ? (
              <div className="text-center py-8 space-y-1">
                <History className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">Sem alterações registradas</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {histData.map((h) => (
                  <div key={h.id} className="py-3 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {statusLabel(h.status_anterior ?? '—')}
                        {' → '}
                        {statusLabel(h.status_novo)}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {formatDatetime(h.created_at)}
                      </span>
                    </div>
                    {h.alterado_por_nome && (
                      <p className="text-xs text-muted-foreground">Por {h.alterado_por_nome}</p>
                    )}
                    {h.observacao && (
                      <p className="text-xs text-foreground/80 italic">"{h.observacao}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => setHistChamado(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir chamado?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const c = chamados.find((x) => x.id === deleteId);
                return `"${c?.titulo ?? ''}" será removido permanentemente. Esta ação não pode ser desfeita.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
