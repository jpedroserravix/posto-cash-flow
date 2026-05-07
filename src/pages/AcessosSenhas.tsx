import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Copy, Check,
  ExternalLink, Search, KeyRound, ChevronDown, ChevronUp,
  Mail, Smartphone,
} from 'lucide-react';
import { ObsTooltip } from '@/components/ObsTooltip';

// ─── types ──────────────────────────────────────────────────────────────────

interface Acesso {
  id: string;
  posto_id: string | null;
  nome_servico: string;
  url: string | null;
  login: string | null;
  senha: string | null;
  observacoes: string | null;
  email_recuperacao: string | null;
  celular: string | null;
  atualizado_por_nome: string | null;
  criado_por_nome: string | null;
  created_at: string;
  updated_at: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function CopyBtn({ value }: { value: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copiar"
      className="ml-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── constants ──────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  posto_id: '',
  nome_servico: '',
  url: '',
  login: '',
  senha: '',
  observacoes: '',
  email_recuperacao: '',
  celular: '',
};

// ─── component ──────────────────────────────────────────────────────────────

export default function AcessosSenhas() {
  const { allPostos, selectedPostoId, isMaster, nome: authNome } = useAuth();

  const [acessos, setAcessos]       = useState<Acesso[]>([]);
  const [loading, setLoading]       = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [deleteId, setDeleteId]     = useState<string | null>(null);

  // Per-row states
  const [visiblePwd, setVisiblePwd]     = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Form states
  const [showFormPwd, setShowFormPwd]   = useState(false);
  const [showExtra, setShowExtra]       = useState(false);

  // Filters
  const [search, setSearch]           = useState('');
  const [filterPosto, setFilterPosto] = useState('__all__');

  const postoOptions = allPostos.length > 0 ? allPostos : [];
  const postoMap = useMemo(
    () => new Map(postoOptions.map((p) => [p.id, p.nome])),
    [postoOptions],
  );

  useEffect(() => { load(selectedPostoId, isMaster); }, [selectedPostoId, isMaster]);

  async function load(postoId: string | null, masterUser: boolean) {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from('acessos_senhas')
        .select('*')
        .order('nome_servico', { ascending: true });

      if (!masterUser) {
        // Non-masters see only records tied to their selected posto (Geral excluded)
        query = postoId
          ? query.eq('posto_id', postoId)
          : query.eq('posto_id', 'no-match'); // no posto selected → show nothing
      }

      const { data, error } = await query;
      if (error) { toast.error(`Erro ao carregar acessos: ${error.message}`); }
      else { setAcessos((data as Acesso[]) || []); }
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  // ── filters ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = acessos;
    if (filterPosto === '__geral__') {
      list = list.filter((a) => a.posto_id === null);
    } else if (filterPosto !== '__all__') {
      list = list.filter((a) => a.posto_id === filterPosto);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.nome_servico.toLowerCase().includes(q));
    }
    return list;
  }, [acessos, filterPosto, search]);

  // ── dialog ─────────────────────────────────────────────────────────────────

  function openNew() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, posto_id: selectedPostoId || '' });
    setShowFormPwd(false);
    setShowExtra(false);
    setDialogOpen(true);
  }

  function openEdit(a: Acesso) {
    setEditId(a.id);
    setForm({
      posto_id:          a.posto_id          || '',
      nome_servico:      a.nome_servico,
      url:               a.url               || '',
      login:             a.login             || '',
      senha:             a.senha             || '',
      observacoes:       a.observacoes       || '',
      email_recuperacao: a.email_recuperacao || '',
      celular:           a.celular           || '',
    });
    setShowFormPwd(false);
    // Auto-open extra section if it has data
    setShowExtra(!!(a.email_recuperacao || a.celular));
    setDialogOpen(true);
  }

  function closeDialog() {
    if (saving) return;
    setDialogOpen(false);
  }

  // ── save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.nome_servico.trim()) { toast.error('Informe o nome do serviço'); return; }
    setSaving(true);

    const now = new Date().toISOString();
    const autorNome = authNome || 'Desconhecido';

    const payload: Record<string, unknown> = {
      posto_id:           form.posto_id          || null,
      nome_servico:       form.nome_servico.trim(),
      url:                form.url.trim()         || null,
      login:              form.login.trim()       || null,
      senha:              form.senha              || null,
      observacoes:        form.observacoes.trim() || null,
      email_recuperacao:  form.email_recuperacao.trim() || null,
      celular:            form.celular.trim()     || null,
      atualizado_por_nome: autorNome,
      updated_at:         now,
    };

    if (!editId) {
      payload.criado_por_nome = autorNome;
    }

    const q = editId
      ? (supabase as any).from('acessos_senhas').update(payload).eq('id', editId)
      : (supabase as any).from('acessos_senhas').insert(payload);

    const { error } = await q;
    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } else {
      toast.success(editId ? 'Acesso atualizado' : 'Acesso cadastrado');
      setDialogOpen(false);
      load();
    }
    setSaving(false);
  }

  // ── delete ─────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await (supabase as any)
      .from('acessos_senhas')
      .delete()
      .eq('id', deleteId);
    if (error) { toast.error('Erro ao excluir'); }
    else {
      toast.success('Acesso excluído');
      setAcessos((prev) => prev.filter((a) => a.id !== deleteId));
    }
    setDeleteId(null);
  }

  // ── row toggles ────────────────────────────────────────────────────────────

  function toggleRowPwd(id: string) {
    setVisiblePwd((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Acessos e Senhas</h1>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openNew}>
          <Plus className="w-4 h-4" />
          Novo Acesso
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
                placeholder="Buscar serviço..."
                className="h-8 text-xs pl-8"
              />
            </div>
            {isMaster && postoOptions.length > 0 && (
              <Select value={filterPosto} onValueChange={setFilterPosto}>
                <SelectTrigger className="h-8 text-xs w-44">
                  <SelectValue placeholder="Todos os postos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os postos</SelectItem>
                  <SelectItem value="__geral__">Geral (sem posto)</SelectItem>
                  {postoOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {acessos.length === 0 ? 'Nenhum acesso cadastrado ainda.' : 'Nenhum resultado para os filtros aplicados.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-6"></TableHead>
                    <TableHead className="text-xs">Serviço</TableHead>
                    <TableHead className="text-xs">URL</TableHead>
                    <TableHead className="text-xs">Login</TableHead>
                    <TableHead className="text-xs">Senha</TableHead>
                    <TableHead className="text-xs">Posto</TableHead>
                    <TableHead className="text-xs">Observações</TableHead>
                    <TableHead className="text-xs w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => {
                    const pwdVisible  = visiblePwd.has(a.id);
                    const isExpanded  = expandedRows.has(a.id);
                    const hasExtra    = !!(a.email_recuperacao || a.celular);

                    return (
                      <>
                        <TableRow key={a.id} className={isExpanded ? 'border-b-0' : ''}>
                          {/* Expand toggle */}
                          <TableCell className="pr-0">
                            {hasExtra && (
                              <button
                                onClick={() => toggleExpand(a.id)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                                title={isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                              >
                                {isExpanded
                                  ? <ChevronUp className="w-3.5 h-3.5" />
                                  : <ChevronDown className="w-3.5 h-3.5" />
                                }
                              </button>
                            )}
                          </TableCell>

                          {/* Nome do serviço + audit */}
                          <TableCell className="text-xs font-medium whitespace-nowrap">
                            <div>{a.nome_servico}</div>
                            {a.atualizado_por_nome && (
                              <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                                Atualizado por {a.atualizado_por_nome} — {formatDate(a.updated_at)}
                              </div>
                            )}
                          </TableCell>

                          {/* URL */}
                          <TableCell className="text-xs">
                            {a.url ? (
                              <div className="flex items-center gap-1">
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline truncate max-w-[140px] block"
                                  title={a.url}
                                >
                                  {a.url.replace(/^https?:\/\//, '').split('/')[0]}
                                </a>
                                <a href={a.url} target="_blank" rel="noopener noreferrer" title="Abrir em nova aba">
                                  <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                </a>
                                <CopyBtn value={a.url} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Login */}
                          <TableCell className="text-xs">
                            {a.login ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono">{a.login}</span>
                                <CopyBtn value={a.login} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Senha */}
                          <TableCell className="text-xs">
                            {a.senha ? (
                              <div className="flex items-center gap-1">
                                <span className="font-mono">
                                  {pwdVisible ? a.senha : '••••••••'}
                                </span>
                                <button
                                  onClick={() => toggleRowPwd(a.id)}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title={pwdVisible ? 'Esconder senha' : 'Mostrar senha'}
                                >
                                  {pwdVisible
                                    ? <EyeOff className="w-3.5 h-3.5" />
                                    : <Eye className="w-3.5 h-3.5" />
                                  }
                                </button>
                                <CopyBtn value={a.senha} />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          {/* Posto */}
                          <TableCell className="text-xs">
                            {a.posto_id
                              ? <Badge variant="outline" className="text-[10px] whitespace-nowrap">{postoMap.get(a.posto_id) ?? a.posto_id}</Badge>
                              : <span className="text-muted-foreground text-[11px]">Geral</span>
                            }
                          </TableCell>

                          {/* Observações */}
                          <TableCell className="text-xs max-w-[160px]">
                            <ObsTooltip text={a.observacoes} />
                          </TableCell>

                          {/* Actions */}
                          <TableCell>
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7"
                                onClick={() => openEdit(a)}
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteId(a.id)}
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <TableRow key={`${a.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={7} className="py-2 pb-3">
                              <div className="flex flex-wrap gap-4 text-xs">
                                {a.email_recuperacao && (
                                  <div className="flex items-center gap-1.5">
                                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">E-mail recuperação:</span>
                                    <span className="font-mono">{a.email_recuperacao}</span>
                                    <CopyBtn value={a.email_recuperacao} />
                                  </div>
                                )}
                                {a.celular && (
                                  <div className="flex items-center gap-1.5">
                                    <Smartphone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">Celular:</span>
                                    <span className="font-mono">{a.celular}</span>
                                    <CopyBtn value={a.celular} />
                                  </div>
                                )}
                                {a.criado_por_nome && (
                                  <div className="text-[10px] text-muted-foreground ml-auto">
                                    Criado por {a.criado_por_nome}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Add / Edit dialog ─────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Acesso' : 'Novo Acesso'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1 overflow-y-auto flex-1 pr-1">
            {/* Nome do serviço */}
            <div className="space-y-1">
              <Label className="text-xs">Nome do serviço *</Label>
              <Input
                value={form.nome_servico}
                onChange={(e) => setForm((f) => ({ ...f, nome_servico: e.target.value }))}
                placeholder="Ex: Email Posto Serravix, VR Alimentação, Site ANP"
                className="text-sm"
                disabled={saving}
              />
            </div>

            {/* URL */}
            <div className="space-y-1">
              <Label className="text-xs">URL / Link (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                  className="text-sm"
                  disabled={saving}
                />
                {form.url.trim() && (
                  <a href={form.url.trim()} target="_blank" rel="noopener noreferrer">
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Abrir link">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </a>
                )}
              </div>
            </div>

            {/* Login + Senha — 2-col */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Login / Usuário</Label>
                <div className="flex gap-1">
                  <Input
                    value={form.login}
                    onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                    placeholder="usuário@email.com"
                    className="text-sm"
                    disabled={saving}
                  />
                  <CopyBtn value={form.login} />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Senha</Label>
                <div className="flex gap-1">
                  <div className="relative flex-1">
                    <Input
                      type={showFormPwd ? 'text' : 'password'}
                      value={form.senha}
                      onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                      placeholder="••••••••"
                      className="text-sm pr-8"
                      disabled={saving}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPwd((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title={showFormPwd ? 'Esconder' : 'Mostrar'}
                    >
                      {showFormPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <CopyBtn value={form.senha} />
                </div>
              </div>
            </div>

            {/* Posto */}
            {postoOptions.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Posto vinculado (opcional)</Label>
                <Select
                  value={form.posto_id || '__none__'}
                  onValueChange={(v) => setForm((f) => ({ ...f, posto_id: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue placeholder="Geral (sem posto específico)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Geral (sem posto específico)</SelectItem>
                    {postoOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Observações */}
            <div className="space-y-1">
              <Label className="text-xs">Observações (opcional)</Label>
              <Textarea
                value={form.observacoes}
                onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                placeholder="Notas adicionais sobre este acesso..."
                className="text-sm resize-none"
                rows={2}
                disabled={saving}
              />
            </div>

            {/* ── Mais informações (collapsible) ─────────────────────────────── */}
            <div className="border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setShowExtra((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <span className="font-medium">Mais informações</span>
                {showExtra ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showExtra && (
                <div className="px-3 pb-3 pt-1 space-y-3 border-t bg-muted/20">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Mail className="w-3 h-3" /> E-mail de recuperação (opcional)
                    </Label>
                    <Input
                      value={form.email_recuperacao}
                      onChange={(e) => setForm((f) => ({ ...f, email_recuperacao: e.target.value }))}
                      placeholder="email@exemplo.com"
                      className="text-sm"
                      disabled={saving}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <Smartphone className="w-3 h-3" /> Celular vinculado (opcional)
                    </Label>
                    <Input
                      value={form.celular}
                      onChange={(e) => setForm((f) => ({ ...f, celular: e.target.value }))}
                      placeholder="(11) 99999-9999"
                      className="text-sm"
                      disabled={saving}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.nome_servico.trim()}>
              {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir acesso?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação é irreversível. O registro de acesso será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
