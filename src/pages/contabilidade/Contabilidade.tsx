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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Paperclip, ExternalLink, BookOpen } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { openInNewTab } from '@/lib/utils';
import { ObsTooltip } from '@/components/ObsTooltip';

// ─── types ───────────────────────────────────────────────────────────────────

interface ContabilidadeDoc {
  id: string;
  posto_id: string;
  tipo: string;
  tipo_custom: string | null;
  mes: number;
  ano: number;
  arquivo_path: string;
  arquivo_type: string;
  observacoes: string | null;
  created_at: string;
}

interface PreviewFile { url: string; type: 'image' | 'pdf'; }

// ─── constants ───────────────────────────────────────────────────────────────

const TIPOS = ['DRE', 'Balanço Patrimonial', 'Balancete', 'Outros'] as const;

const MESES = [
  { value: 1,  label: 'Janeiro' },
  { value: 2,  label: 'Fevereiro' },
  { value: 3,  label: 'Março' },
  { value: 4,  label: 'Abril' },
  { value: 5,  label: 'Maio' },
  { value: 6,  label: 'Junho' },
  { value: 7,  label: 'Julho' },
  { value: 8,  label: 'Agosto' },
  { value: 9,  label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const ANO_ATUAL = new Date().getFullYear();
const ANOS = Array.from({ length: ANO_ATUAL - 2019 }, (_, i) => ANO_ATUAL - i);

const EMPTY_FORM = { tipo: '', tipo_custom: '', mes: '', ano: '', observacoes: '' };

// ─── helpers ─────────────────────────────────────────────────────────────────

function nomeTipo(doc: ContabilidadeDoc) {
  return doc.tipo === 'Outros' && doc.tipo_custom ? doc.tipo_custom : doc.tipo;
}

function tipoColor(tipo: string) {
  if (tipo === 'DRE')                return 'bg-blue-500 hover:bg-blue-500';
  if (tipo === 'Balanço Patrimonial') return 'bg-purple-600 hover:bg-purple-600';
  if (tipo === 'Balancete')          return 'bg-teal-600 hover:bg-teal-600';
  return 'bg-gray-500 hover:bg-gray-500';
}

function mesLabel(n: number) { return MESES.find((m) => m.value === n)?.label ?? String(n); }

// ─── FilePreview ─────────────────────────────────────────────────────────────

function FilePreview({
  path, tipo, onOpen,
}: { path: string; tipo: string; onOpen: (f: PreviewFile) => void }) {
  const isMobile = useIsMobile();
  const isImage = tipo?.startsWith('image');
  const url = supabase.storage.from('documentos-comprovantes').getPublicUrl(path).data.publicUrl;
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
          title="Ver documento"
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

export default function Contabilidade() {
  const { selectedPostoId } = useAuth();

  const [docs, setDocs]         = useState<ContabilidadeDoc[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);
  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [file, setFile]         = useState<File | null>(null);
  const [saving, setSaving]     = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  // filters
  const [fTipo, setFTipo] = useState('__all__');
  const [fAno, setFAno]   = useState('__all__');

  useEffect(() => { load(); }, [selectedPostoId]);

  async function load() {
    if (!selectedPostoId) { setDocs([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('documentos_contabilidade')
      .select('*')
      .eq('posto_id', selectedPostoId)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false });
    if (error) toast.error('Erro ao carregar documentos');
    else setDocs(data ?? []);
    setLoading(false);
  }

  // ── filtered + grouped ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = docs;
    if (fTipo !== '__all__') list = list.filter((d) => d.tipo === fTipo);
    if (fAno  !== '__all__') list = list.filter((d) => d.ano === Number(fAno));
    return list;
  }, [docs, fTipo, fAno]);

  const byYear = useMemo(() => {
    const map = new Map<number, ContabilidadeDoc[]>();
    for (const d of filtered) {
      if (!map.has(d.ano)) map.set(d.ano, []);
      map.get(d.ano)!.push(d);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [filtered]);

  const anosDisponiveis = useMemo(() => [...new Set(docs.map((d) => d.ano))].sort((a, b) => b - a), [docs]);

  // ── dialog ────────────────────────────────────────────────────────────────

  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setFile(null);
    setDialogOpen(true);
  }

  function openEdit(d: ContabilidadeDoc) {
    setEditId(d.id);
    setForm({
      tipo:        d.tipo,
      tipo_custom: d.tipo_custom ?? '',
      mes:         String(d.mes),
      ano:         String(d.ano),
      observacoes: d.observacoes ?? '',
    });
    setFile(null);
    setDialogOpen(true);
  }

  // ── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.tipo)             { toast.error('Selecione o tipo de documento'); return; }
    if (form.tipo === 'Outros' && !form.tipo_custom.trim()) { toast.error('Informe o tipo do documento'); return; }
    if (!form.mes)              { toast.error('Selecione o mês'); return; }
    if (!form.ano)              { toast.error('Selecione o ano'); return; }
    if (!editId && !file)       { toast.error('Anexe o arquivo'); return; }
    if (!selectedPostoId)       { toast.error('Selecione o posto'); return; }
    if (file && file.size > 10 * 1024 * 1024) { toast.error('Arquivo muito grande. Máximo 10 MB'); return; }

    setSaving(true);

    let arquivo_path: string | undefined;
    let arquivo_type: string | undefined;

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
      const path = `contabilidade/${selectedPostoId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from('documentos-comprovantes')
        .upload(path, file, { contentType: file.type });
      if (upErr) { toast.error('Erro ao enviar arquivo'); setSaving(false); return; }
      arquivo_path = path;
      arquivo_type = file.type.startsWith('image/') ? file.type : 'application/pdf';
      void ext;
    }

    const payload: Record<string, unknown> = {
      posto_id:   selectedPostoId,
      tipo:       form.tipo,
      tipo_custom: form.tipo === 'Outros' ? (form.tipo_custom.trim() || null) : null,
      mes:        Number(form.mes),
      ano:        Number(form.ano),
      observacoes: form.observacoes.trim() || null,
    };
    if (arquivo_path) { payload.arquivo_path = arquivo_path; payload.arquivo_type = arquivo_type; }

    let error;
    if (editId) {
      ({ error } = await (supabase as any).from('documentos_contabilidade').update(payload).eq('id', editId));
    } else {
      ({ error } = await (supabase as any).from('documentos_contabilidade').insert(payload));
    }

    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } else {
      toast.success(editId ? 'Documento atualizado' : 'Documento adicionado');
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
    const { error } = await (supabase as any).from('documentos_contabilidade').delete().eq('id', deleteId);
    if (error) { toast.error('Erro ao excluir'); }
    else {
      toast.success('Documento excluído');
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
          <BookOpen className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Contabilidade</h1>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openNew} disabled={!selectedPostoId}>
          <Plus className="w-4 h-4" />
          Novo Documento
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex gap-2 flex-wrap">
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fAno} onValueChange={setFAno}>
              <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="Ano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os anos</SelectItem>
                {anosDisponiveis.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : byYear.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">
          {docs.length === 0 ? 'Nenhum documento cadastrado ainda.' : 'Nenhum resultado para os filtros aplicados.'}
        </div>
      ) : (
        <div className="space-y-4">
          {byYear.map(([ano, anosDocs]) => (
            <Card key={ano}>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground">{ano}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs pl-4">Mês</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Observações</TableHead>
                      <TableHead className="text-xs w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {anosDocs.map((d) => (
                      <TableRow key={d.id} className="text-xs">
                        <TableCell className="pl-4 font-medium whitespace-nowrap">{mesLabel(d.mes)}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] text-white ${tipoColor(d.tipo)}`}>
                            {nomeTipo(d)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[220px]">
                          <ObsTooltip text={d.observacoes} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end pr-2">
                            <FilePreview path={d.arquivo_path} tipo={d.arquivo_type} onOpen={setPreviewFile} />
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Add / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v && !saving) setDialogOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Documento' : 'Novo Documento Contábil'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* Tipo */}
            <div className="space-y-1">
              <Label className="text-xs">Tipo de documento *</Label>
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
                  placeholder="Ex: Livro Caixa, SPED Fiscal..."
                  value={form.tipo_custom}
                  onChange={(e) => setForm((f) => ({ ...f, tipo_custom: e.target.value }))}
                  disabled={saving}
                />
              </div>
            )}

            {/* Período */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Mês de referência *</Label>
                <Select value={form.mes} onValueChange={(v) => setForm((f) => ({ ...f, mes: v }))}>
                  <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Mês" /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ano *</Label>
                <Select value={form.ano} onValueChange={(v) => setForm((f) => ({ ...f, ano: v }))}>
                  <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Ano" /></SelectTrigger>
                  <SelectContent>
                    {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Arquivo */}
            <div className="space-y-1">
              <Label className="text-xs">Arquivo {editId ? '(deixe vazio para manter o atual)' : '*'}</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="h-9 text-sm file:mr-3 file:h-7 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-medium"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">PDF, JPEG ou PNG · Máximo 10 MB</p>
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
            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
            <AlertDialogDescription>O arquivo também será removido. Esta ação não pode ser desfeita.</AlertDialogDescription>
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
