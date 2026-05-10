import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Paperclip, ExternalLink, Download, Search, Palette, FileText } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { openInNewTab } from '@/lib/utils';
import { ObsTooltip } from '@/components/ObsTooltip';

// ─── types ───────────────────────────────────────────────────────────────────

interface IdentidadeDoc {
  id: string;
  posto_id: string;
  tipo: string;
  tipo_custom: string | null;
  nome: string;
  arquivo_path: string;
  arquivo_type: string;
  observacoes: string | null;
  created_at: string;
}

interface PreviewFile { url: string; type: 'image' | 'pdf'; }

// ─── constants ───────────────────────────────────────────────────────────────

const TIPOS = ['Logo', 'Banner', 'Modelo de Placa', 'Cartão de Visita', 'Papel Timbrado', 'Uniforme', 'Outros'] as const;

const TIPO_COLORS: Record<string, string> = {
  'Logo':             'bg-blue-600 hover:bg-blue-600',
  'Banner':           'bg-orange-500 hover:bg-orange-500',
  'Modelo de Placa':  'bg-green-600 hover:bg-green-600',
  'Cartão de Visita': 'bg-purple-600 hover:bg-purple-600',
  'Papel Timbrado':   'bg-teal-600 hover:bg-teal-600',
  'Uniforme':         'bg-yellow-600 hover:bg-yellow-600',
  'Outros':           'bg-gray-500 hover:bg-gray-500',
};

const EMPTY_FORM = { tipo: '', tipo_custom: '', nome: '', observacoes: '' };

// ─── helpers ─────────────────────────────────────────────────────────────────

function nomeTipo(doc: IdentidadeDoc) {
  return doc.tipo === 'Outros' && doc.tipo_custom ? doc.tipo_custom : doc.tipo;
}

function getPublicUrl(path: string) {
  return supabase.storage.from('documentos-comprovantes').getPublicUrl(path).data.publicUrl;
}

// ─── Thumbnail ───────────────────────────────────────────────────────────────

function Thumbnail({ path, tipo }: { path: string; tipo: string }) {
  const isImage = tipo?.startsWith('image');
  const url = getPublicUrl(path);
  if (!isImage) {
    return (
      <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center shrink-0">
        <FileText className="w-4 h-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="w-10 h-10 rounded border overflow-hidden shrink-0 bg-muted">
      <img src={url} alt="" className="w-full h-full object-cover" />
    </div>
  );
}

// ─── FilePreview ─────────────────────────────────────────────────────────────

function FilePreview({ path, tipo, onOpen }: {
  path: string; tipo: string; onOpen: (f: PreviewFile) => void;
}) {
  const isMobile = useIsMobile();
  const isImage = tipo?.startsWith('image');
  const url = getPublicUrl(path);
  const handleClick = () => {
    if (!isImage && isMobile) { openInNewTab(url); return; }
    onOpen({ url, type: isImage ? 'image' : 'pdf' });
  };
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button
          className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
          onClick={handleClick}
          title="Visualizar"
        >
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="left" className="w-48 p-1">
        {isImage ? (
          <img src={url} className="w-full rounded object-cover" alt="" />
        ) : (
          <iframe src={url} className="w-full h-36 rounded" title="preview" />
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function IdentidadeVisual() {
  const { selectedPostoId } = useAuth();

  const [docs, setDocs]             = useState<IdentidadeDoc[]>([]);
  const [loading, setLoading]       = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [file, setFile]             = useState<File | null>(null);
  const [saving, setSaving]         = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // filters
  const [fTipo, setFTipo]     = useState('__all__');
  const [search, setSearch]   = useState('');

  useEffect(() => { load(); }, [selectedPostoId]);

  async function load() {
    if (!selectedPostoId) { setDocs([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('documentos_identidade_visual')
      .select('*')
      .eq('posto_id', selectedPostoId)
      .order('tipo', { ascending: true })
      .order('nome', { ascending: true });
    if (error) toast.error('Erro ao carregar documentos');
    else setDocs(data ?? []);
    setLoading(false);
  }

  // ── filtered + grouped by tipo ────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = docs;
    if (fTipo !== '__all__') list = list.filter((d) => d.tipo === fTipo);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((d) => d.nome.toLowerCase().includes(q) || nomeTipo(d).toLowerCase().includes(q));
    }
    return list;
  }, [docs, fTipo, search]);

  const byTipo = useMemo(() => {
    const order = [...TIPOS];
    const map = new Map<string, IdentidadeDoc[]>();
    for (const d of filtered) {
      const key = d.tipo;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries()).sort(
      (a, b) => order.indexOf(a[0] as any) - order.indexOf(b[0] as any)
    );
  }, [filtered]);

  // ── dialog ────────────────────────────────────────────────────────────────

  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setFile(null);
    setDialogOpen(true);
  }

  function openEdit(d: IdentidadeDoc) {
    setEditId(d.id);
    setForm({
      tipo:        d.tipo,
      tipo_custom: d.tipo_custom ?? '',
      nome:        d.nome,
      observacoes: d.observacoes ?? '',
    });
    setFile(null);
    setDialogOpen(true);
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.tipo)             { toast.error('Selecione o tipo'); return; }
    if (form.tipo === 'Outros' && !form.tipo_custom.trim()) { toast.error('Informe a descrição do tipo'); return; }
    if (!form.nome.trim())      { toast.error('Informe o nome/descrição do arquivo'); return; }
    if (!editId && !file)       { toast.error('Anexe o arquivo'); return; }
    if (!selectedPostoId)       { toast.error('Selecione o posto'); return; }
    if (file && file.size > 20 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 20 MB'); return; }

    setSaving(true);

    let arquivo_path: string | undefined;
    let arquivo_type: string | undefined;

    if (file) {
      const path = `identidade/${selectedPostoId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('documentos-comprovantes')
        .upload(path, file, { contentType: file.type });
      if (upErr) { toast.error('Erro ao enviar arquivo'); setSaving(false); return; }
      arquivo_path = path;
      arquivo_type = file.type;
    }

    const payload: Record<string, unknown> = {
      posto_id:   selectedPostoId,
      tipo:       form.tipo,
      tipo_custom: form.tipo === 'Outros' ? (form.tipo_custom.trim() || null) : null,
      nome:       form.nome.trim(),
      observacoes: form.observacoes.trim() || null,
    };
    if (arquivo_path) { payload.arquivo_path = arquivo_path; payload.arquivo_type = arquivo_type; }

    let error;
    if (editId) {
      ({ error } = await (supabase as any).from('documentos_identidade_visual').update(payload).eq('id', editId));
    } else {
      ({ error } = await (supabase as any).from('documentos_identidade_visual').insert(payload));
    }

    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } else {
      toast.success(editId ? 'Arquivo atualizado' : 'Arquivo adicionado');
      setDialogOpen(false);
      load();
    }
    setSaving(false);
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return;
    const doc = docs.find((d) => d.id === deleteId);
    if (doc?.arquivo_path) {
      await supabase.storage.from('documentos-comprovantes').remove([doc.arquivo_path]);
    }
    const { error } = await (supabase as any).from('documentos_identidade_visual').delete().eq('id', deleteId);
    if (error) { toast.error('Erro ao excluir'); }
    else {
      toast.success('Arquivo excluído');
      setDocs((prev) => prev.filter((d) => d.id !== deleteId));
    }
    setDeleteId(null);
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Identidade Visual e Modelos</h1>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openNew} disabled={!selectedPostoId}>
          <Plus className="w-4 h-4" />
          Novo Arquivo
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome..."
                className="h-8 text-xs pl-8"
              />
            </div>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : byTipo.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {docs.length === 0 ? 'Nenhum arquivo cadastrado ainda.' : 'Nenhum resultado para os filtros aplicados.'}
        </div>
      ) : (
        <div className="space-y-4">
          {byTipo.map(([tipo, tipoDocs]) => (
            <Card key={tipo}>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge className={`text-[10px] text-white ${TIPO_COLORS[tipo] ?? 'bg-gray-500'}`}>{tipo}</Badge>
                  <span className="text-xs text-muted-foreground font-normal">{tipoDocs.length} {tipoDocs.length === 1 ? 'arquivo' : 'arquivos'}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {tipoDocs.map((d) => {
                    const url = getPublicUrl(d.arquivo_path);
                    return (
                      <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                        <Thumbnail path={d.arquivo_path} tipo={d.arquivo_type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.nome}</p>
                          {d.tipo === 'Outros' && d.tipo_custom && (
                            <p className="text-xs text-muted-foreground">{d.tipo_custom}</p>
                          )}
                          {d.observacoes && (
                            <p className="text-xs text-muted-foreground truncate"><ObsTooltip text={d.observacoes} /></p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <FilePreview path={d.arquivo_path} tipo={d.arquivo_type} onOpen={setPreviewFile} />
                          <a href={url} download target="_blank" rel="noopener noreferrer">
                            <button
                              className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </a>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => openEdit(d)} title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteId(d.id)} title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v && !saving) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Arquivo' : 'Novo Arquivo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* Tipo */}
            <div className="space-y-1">
              <Label className="text-xs">Tipo *</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v, tipo_custom: '' }))}>
                <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Selecionar tipo" /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.tipo === 'Outros' && (
              <div className="space-y-1">
                <Label className="text-xs">Descrição do tipo *</Label>
                <Input
                  className="text-sm h-9"
                  placeholder="Ex: Adesivo, Fachada, Template..."
                  value={form.tipo_custom}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_custom: e.target.value }))}
                  disabled={saving}
                />
              </div>
            )}

            {/* Nome */}
            <div className="space-y-1">
              <Label className="text-xs">Nome / Descrição *</Label>
              <Input
                className="text-sm h-9"
                placeholder="Ex: Logo principal fundo branco"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                disabled={saving}
              />
            </div>

            {/* Arquivo */}
            <div className="space-y-1">
              <Label className="text-xs">Arquivo {editId ? '(deixe vazio para manter o atual)' : '*'}</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.svg,.ai,.eps,.zip"
                className="h-9 text-sm file:mr-3 file:h-7 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-medium"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, SVG, AI, EPS ou ZIP · Máximo 20 MB</p>
            </div>

            {/* Observações */}
            <div className="space-y-1">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                className="text-sm resize-none"
                rows={2}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir arquivo?</AlertDialogTitle>
            <AlertDialogDescription>O arquivo também será removido do armazenamento. Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Preview Modal ─────────────────────────────────────────────────── */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl p-2">
          {previewFile?.type === 'image' ? (
            <img src={previewFile.url} className="w-full rounded" alt="" />
          ) : (
            <div className="space-y-1">
              <iframe src={previewFile?.url} className="w-full h-[70vh] rounded" title="preview" />
              <div className="flex justify-end">
                <a href={previewFile?.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir em nova aba
                  </Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
