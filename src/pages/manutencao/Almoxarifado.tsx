import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useListaConfig } from '@/hooks/useListaConfig';
import { useIsMobile } from '@/hooks/use-mobile';
import { openInNewTab } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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
import { toast } from 'sonner';
import { Plus, Search, Archive, Pencil, Trash2, Paperclip, X, ImagePlus } from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface ItemPatrimonio {
  id: string;
  nome: string;
  categoria: string | null;
  tipo_item: string | null;
  codigo: string | null;
  descricao: string | null;
  posto_atual_id: string | null;
  postos: { nome: string } | null;
  status: string;
  valor: string | number | null;
  foto_path: string | null;
  foto_name: string | null;
  foto_type: string | null;
  criado_por_nome: string | null;
  created_at: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  nome:           '',
  categoria:      '__none__',   // __none__ → null in DB
  tipo_item:      '__none__',   // __none__ → null in DB
  codigo:         '',
  descricao:      '',
  posto_atual_id: '',
  status:         'disponivel',
  valor:          '',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusLabel(s: string): string {
  if (s === 'disponivel')    return 'Disponível';
  if (s === 'em_uso')        return 'Em Uso';
  if (s === 'em_manutencao') return 'Em Manutenção';
  if (s === 'baixado')       return 'Baixado';
  return s;
}

function statusClass(s: string): string {
  if (s === 'disponivel')    return 'bg-green-600 hover:bg-green-600 text-white';
  if (s === 'em_uso')        return 'bg-yellow-500 hover:bg-yellow-500 text-white';
  if (s === 'em_manutencao') return 'bg-yellow-500 hover:bg-yellow-500 text-white';
  return 'bg-gray-400 hover:bg-gray-400 text-white';
}

function categoriaLabel(c: string | null): string {
  if (c === 'ferramenta')  return 'Ferramenta';
  if (c === 'equipamento') return 'Equipamento';
  if (c === 'material')    return 'Material';
  return c ?? '—';
}

function formatValor(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = parseFloat(String(v));
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getPhotoUrl(path: string) {
  return supabase.storage.from('manutencao').getPublicUrl(path).data.publicUrl;
}

// ─── PhotoPreview (hover card) ────────────────────────────────────────────────

function PhotoPreview({ item }: { item: ItemPatrimonio }) {
  const isMobile = useIsMobile();
  if (!item.foto_path) return null;
  const isImage = item.foto_type?.startsWith('image');
  const url = getPhotoUrl(item.foto_path);

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button
          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
          onClick={() => { if (isMobile || !isImage) openInNewTab(url); }}
          title="Ver foto"
        >
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </HoverCardTrigger>
      {!isMobile && (
        <HoverCardContent side="left" className="w-48 p-1">
          {isImage ? (
            <img src={url} className="w-full rounded object-cover" alt="" />
          ) : (
            <iframe src={url} className="w-full h-36 rounded" title="preview" />
          )}
        </HoverCardContent>
      )}
    </HoverCard>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function Almoxarifado() {
  const {
    selectedPostoId,
    postoId: singlePostoId,
    postoNome: singlePostoNome,
    allPostos,
    nome: authNome,
  } = useAuth();

  const tiposPatrimonio = useListaConfig('tipos_patrimonio', []);
  const fileInputRef    = useRef<HTMLInputElement>(null);

  const [items, setItems]     = useState<ItemPatrimonio[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search,          setSearch]          = useState('');
  const [filterStatus,    setFilterStatus]    = useState('__all__');
  const [filterCategoria, setFilterCategoria] = useState('__all__');

  // dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [form,       setForm]       = useState({ ...EMPTY_FORM });
  const [saving,     setSaving]     = useState(false);

  // photo
  const [photoFile,   setPhotoFile]   = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [existingPhotoPath, setExistingPhotoPath] = useState<string | null>(null);

  // delete
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // postos available to this user (multi or single)
  const postoOptions = useMemo(() => {
    if (allPostos.length > 0) return allPostos;
    if (singlePostoId) return [{ id: singlePostoId, nome: singlePostoNome ?? singlePostoId, cnpj: '' }];
    return [];
  }, [allPostos, singlePostoId, singlePostoNome]);

  // ── data ──────────────────────────────────────────────────────────────────

  useEffect(() => { load(); }, [selectedPostoId]);

  async function load() {
    if (!selectedPostoId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('itens_patrimonio')
        .select('id, nome, categoria, tipo_item, codigo, descricao, posto_atual_id, status, valor, foto_path, foto_name, foto_type, criado_por_nome, created_at, postos(nome)')
        .eq('posto_atual_id', selectedPostoId)
        .order('nome', { ascending: true });

      if (error) toast.error(`Erro ao carregar itens: ${error.message}`);
      else setItems((data as ItemPatrimonio[]) || []);
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  // ── filters ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = items;
    if (filterStatus    !== '__all__') list = list.filter((i) => i.status    === filterStatus);
    if (filterCategoria !== '__all__') list = list.filter((i) => i.categoria === filterCategoria);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) => i.nome.toLowerCase().includes(q) || (i.codigo ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filterStatus, filterCategoria, search]);

  // ── dialog helpers ────────────────────────────────────────────────────────

  function openNew() {
    setEditId(null);
    setForm({
      ...EMPTY_FORM,
      posto_atual_id: selectedPostoId ?? postoOptions[0]?.id ?? '',
    });
    setPhotoFile(null);
    setRemovePhoto(false);
    setExistingPhotoPath(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setDialogOpen(true);
  }

  function openEdit(item: ItemPatrimonio) {
    setEditId(item.id);
    setForm({
      nome:           item.nome,
      categoria:      item.categoria ?? '__none__',
      tipo_item:      item.tipo_item  ?? '__none__',
      codigo:         item.codigo     ?? '',
      descricao:      item.descricao  ?? '',
      posto_atual_id: item.posto_atual_id ?? '',
      status:         item.status,
      valor:          item.valor !== null && item.valor !== undefined
                        ? String(parseFloat(String(item.valor)) || '')
                        : '',
    });
    setPhotoFile(null);
    setRemovePhoto(false);
    setExistingPhotoPath(item.foto_path);
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

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.nome.trim())        { toast.error('Informe o nome do item'); return; }
    if (!form.posto_atual_id)     { toast.error('Selecione o posto'); return; }
    if (photoFile && photoFile.size > 10 * 1024 * 1024) {
      toast.error('Foto muito grande. Máximo 10 MB');
      return;
    }

    setSaving(true);

    let foto_path = existingPhotoPath;
    let foto_name: string | null = editId ? (items.find((i) => i.id === editId)?.foto_name ?? null) : null;
    let foto_type: string | null = editId ? (items.find((i) => i.id === editId)?.foto_type ?? null) : null;

    // Remove old photo from storage if replacing or explicitly removed
    if ((photoFile || removePhoto) && existingPhotoPath) {
      await supabase.storage.from('manutencao').remove([existingPhotoPath]);
      foto_path = null;
      foto_name = null;
      foto_type = null;
    }

    // Upload new photo
    if (photoFile) {
      const safeName  = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path      = `patrimonio/${form.posto_atual_id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('manutencao')
        .upload(path, photoFile, { contentType: photoFile.type });
      if (upErr) { toast.error('Erro ao enviar foto'); setSaving(false); return; }
      foto_path = path;
      foto_name = photoFile.name;
      foto_type = photoFile.type;
    }

    const valorNum = form.valor.trim() ? parseFloat(form.valor.replace(',', '.')) : null;

    const payload: Record<string, unknown> = {
      nome:           form.nome.trim(),
      categoria:      form.categoria === '__none__' ? null : form.categoria,
      tipo_item:      form.tipo_item  === '__none__' ? null : form.tipo_item,
      codigo:         form.codigo.trim()   || null,
      descricao:      form.descricao.trim() || null,
      posto_atual_id: form.posto_atual_id,
      status:         form.status,
      valor:          isNaN(valorNum as number) ? null : valorNum,
      foto_path,
      foto_name,
      foto_type,
    };

    let error;
    if (editId) {
      ({ error } = await (supabase as any).from('itens_patrimonio').update(payload).eq('id', editId));
    } else {
      payload.criado_por_nome = authNome ?? null;
      ({ error } = await (supabase as any).from('itens_patrimonio').insert(payload));
    }

    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } else {
      toast.success(editId ? 'Item atualizado' : 'Item cadastrado');
      setDialogOpen(false);
      load();
    }
    setSaving(false);
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return;
    const item = items.find((i) => i.id === deleteId);
    if (item?.foto_path) {
      await supabase.storage.from('manutencao').remove([item.foto_path]);
    }
    const { error } = await (supabase as any).from('itens_patrimonio').delete().eq('id', deleteId);
    if (error) {
      toast.error(`Erro ao excluir: ${error.message}`);
    } else {
      toast.success('Item excluído');
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
    }
    setDeleteId(null);
  }

  // ── photo state for dialog ────────────────────────────────────────────────

  // What the dialog currently "has" as photo:
  // - new file selected → show file name
  // - removePhoto → nothing
  // - existingPhotoPath and no changes → show existing
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
          <h1 className="text-xl font-semibold">Almoxarifado</h1>
          <p className="text-sm text-muted-foreground">Itens do patrimônio da rede</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openNew} disabled={!selectedPostoId}>
          <Plus className="w-4 h-4" />
          Novo Item
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por nome ou código..."
                className="pl-8 h-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-sm w-[165px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os status</SelectItem>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="em_uso">Em Uso</SelectItem>
                <SelectItem value="em_manutencao">Em Manutenção</SelectItem>
                <SelectItem value="baixado">Baixado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="h-9 text-sm w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                <SelectItem value="ferramenta">Ferramenta</SelectItem>
                <SelectItem value="equipamento">Equipamento</SelectItem>
                <SelectItem value="material">Material</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : !selectedPostoId ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Selecione um posto para visualizar os itens.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Archive className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-medium text-muted-foreground">
                {items.length === 0 ? 'Nenhum item cadastrado' : 'Nenhum item encontrado'}
              </p>
              {items.length > 0 && (
                <p className="text-xs text-muted-foreground">Tente ajustar os filtros de busca.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Categoria</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Valor</TableHead>
                    <TableHead className="text-xs">Posto</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm font-medium">{item.nome}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {item.codigo || '—'}
                      </TableCell>
                      <TableCell className="text-xs">{categoriaLabel(item.categoria)}</TableCell>
                      <TableCell className="text-xs">{item.tipo_item || '—'}</TableCell>
                      <TableCell className="text-xs">{formatValor(item.valor)}</TableCell>
                      <TableCell className="text-xs">{item.postos?.nome ?? '—'}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusClass(item.status)}`}>
                          {statusLabel(item.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          <PhotoPreview item={item} />
                          <button
                            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
                            onClick={() => openEdit(item)}
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button
                            className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
                            onClick={() => setDeleteId(item.id)}
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!saving) setDialogOpen(v); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Item' : 'Novo Item'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Nome */}
            <div className="space-y-1">
              <Label className="text-xs">Nome <span className="text-red-500">*</span></Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do item"
                disabled={saving}
              />
            </div>

            {/* Categoria + Tipo */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Select
                  value={form.categoria}
                  onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}
                  disabled={saving}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    <SelectItem value="ferramenta">Ferramenta</SelectItem>
                    <SelectItem value="equipamento">Equipamento</SelectItem>
                    <SelectItem value="material">Material</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Item</Label>
                <Select
                  value={form.tipo_item}
                  onValueChange={(v) => setForm((f) => ({ ...f, tipo_item: v }))}
                  disabled={saving}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem tipo</SelectItem>
                    {tiposPatrimonio.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Código + Valor */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Código</Label>
                <Input
                  value={form.codigo}
                  onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                  placeholder="Opcional"
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor (R$)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                  placeholder="0,00"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Descrição */}
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

            {/* Posto + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Posto <span className="text-red-500">*</span></Label>
                {postoOptions.length <= 1 ? (
                  <Input
                    value={postoOptions[0]?.nome ?? '—'}
                    readOnly
                    className="h-9 text-sm bg-muted"
                  />
                ) : (
                  <Select
                    value={form.posto_atual_id}
                    onValueChange={(v) => setForm((f) => ({ ...f, posto_atual_id: v }))}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {postoOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  disabled={saving}
                >
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="em_uso">Em Uso</SelectItem>
                    <SelectItem value="em_manutencao">Em Manutenção</SelectItem>
                    <SelectItem value="baixado">Baixado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Foto */}
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const item = items.find((i) => i.id === deleteId);
                return `"${item?.nome ?? ''}" será removido permanentemente. Esta ação não pode ser desfeita.`;
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
