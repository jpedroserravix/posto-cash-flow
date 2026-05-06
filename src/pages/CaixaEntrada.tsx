import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FileText, UserPlus, Search, Trash2 } from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface Curriculo {
  id: string;
  nome: string;
  cpf: string;
  rg: string | null;
  whatsapp: string;
  cidade: string | null;
  bairro: string | null;
  cargo_desejado: string;
  experiencia: string | null;
  arquivo_path: string | null;
  arquivo_type: string | null;
  status: string;
  candidato_id: string | null;
  posto_id: string | null;
  created_at: string;
}

interface ExpItem {
  cargo: string;
  empresa: string;
  descricao?: string;
  inicio?: string;
  fim?: string;
}

function parseExperiencias(raw: string | null): ExpItem[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as ExpItem[]; } catch { return []; }
}

interface Feedback {
  id: string;
  nome: string | null;
  tipo: string;
  mensagem: string;
  status: string;
  created_at: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const CURRICULO_STATUSES = ['Novo', 'Lido', 'Em contato', 'Rejeitado', 'Não respondeu', 'Arquivado'] as const;
const FEEDBACK_STATUSES  = ['Novo', 'Lido', 'Resolvido'] as const;

const CURRICULO_STATUS_COLORS: Record<string, string> = {
  'Novo':               'bg-blue-500 hover:bg-blue-500',
  'Lido':               'bg-green-600 hover:bg-green-600',
  'Em contato':         'bg-yellow-500 hover:bg-yellow-500',
  'Rejeitado':          'bg-red-500 hover:bg-red-500',
  'Não respondeu':      'bg-gray-400 hover:bg-gray-400',
  'Arquivado':          'bg-slate-300 hover:bg-slate-300 text-slate-700',
};

const FEEDBACK_TYPE_COLORS: Record<string, string> = {
  Elogio:   'bg-green-600 hover:bg-green-600',
  Sugestão: 'bg-blue-500 hover:bg-blue-500',
  Crítica:  'bg-red-500 hover:bg-red-500',
};

const FEEDBACK_STATUS_COLORS: Record<string, string> = {
  Novo:      'bg-blue-500 hover:bg-blue-500',
  Lido:      'bg-gray-400 hover:bg-gray-400',
  Resolvido: 'bg-green-600 hover:bg-green-600',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatCPF(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDate(str: string) {
  const [y, m, d] = str.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function CaixaEntrada() {
  const { selectedPostoId, allPostos } = useAuth();
  const isAdmin = allPostos.length > 0;

  // ── curriculos state ───────────────────────────────────────────────────────
  const [curriculos, setCurriculos] = useState<Curriculo[]>([]);
  const [loadingCurriculos, setLoadingCurriculos] = useState(false);
  const [cStatus, setCStatus] = useState('__all__');
  const [cSearch, setCSearch] = useState('');

  // ── feedback state ─────────────────────────────────────────────────────────
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [fTipo, setFTipo] = useState('__all__');
  const [fStatus, setFStatus] = useState('__all__');
  const [fSearch, setFSearch] = useState('');

  // ── detail dialog ──────────────────────────────────────────────────────────
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Curriculo | null>(null);

  // ── delete dialog ──────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'curriculo' | 'feedback'; id: string; path?: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── mover dialog ───────────────────────────────────────────────────────────
  const [moverOpen, setMoverOpen] = useState(false);
  const [moverTarget, setMoverTarget] = useState<Curriculo | null>(null);
  const [moverPosto, setMoverPosto] = useState('');
  const [savingMover, setSavingMover] = useState(false);

  // ── load ───────────────────────────────────────────────────────────────────

  async function loadCurriculos() {
    setLoadingCurriculos(true);
    const { data, error } = await (supabase as any)
      .from('publico_curriculos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar currículos');
    else setCurriculos(data ?? []);
    setLoadingCurriculos(false);
  }

  async function loadFeedbacks() {
    setLoadingFeedbacks(true);
    const { data, error } = await (supabase as any)
      .from('publico_feedback')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar feedbacks');
    else setFeedbacks(data ?? []);
    setLoadingFeedbacks(false);
  }

  useEffect(() => {
    loadCurriculos();
    loadFeedbacks();
  }, []);

  // ── status changes ─────────────────────────────────────────────────────────

  async function handleCurriculoStatus(id: string, status: string) {
    const { error } = await (supabase as any)
      .from('publico_curriculos').update({ status }).eq('id', id);
    if (error) toast.error('Erro ao atualizar status');
    else setCurriculos((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
  }

  async function handleFeedbackStatus(id: string, status: string) {
    const { error } = await (supabase as any)
      .from('publico_feedback').update({ status }).eq('id', id);
    if (error) toast.error('Erro ao atualizar status');
    else setFeedbacks((prev) => prev.map((f) => f.id === id ? { ...f, status } : f));
  }

  // ── delete ────────────────────────────────────────────────────────────────

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    if (deleteTarget.type === 'curriculo') {
      if (deleteTarget.path) {
        await supabase.storage.from('curriculos-publico').remove([deleteTarget.path]);
      }
      const { error } = await (supabase as any)
        .from('publico_curriculos').delete().eq('id', deleteTarget.id);
      if (error) { toast.error('Erro ao excluir currículo'); setDeleting(false); return; }
      setCurriculos((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      toast.success('Currículo excluído');
    } else {
      const { error } = await (supabase as any)
        .from('publico_feedback').delete().eq('id', deleteTarget.id);
      if (error) { toast.error('Erro ao excluir feedback'); setDeleting(false); return; }
      setFeedbacks((prev) => prev.filter((f) => f.id !== deleteTarget.id));
      toast.success('Feedback excluído');
    }

    setDeleting(false);
    setDeleteTarget(null);
  }

  // ── ver arquivo ────────────────────────────────────────────────────────────

  async function handleVerArquivo(path: string) {
    const { data, error } = await supabase.storage
      .from('curriculos-publico')
      .createSignedUrl(path, 3600);
    if (error || !data) { toast.error('Erro ao abrir arquivo'); return; }
    window.open(data.signedUrl, '_blank');
  }

  // ── open detail ────────────────────────────────────────────────────────────

  function openDetail(c: Curriculo) {
    setDetailTarget(c);
    setDetailOpen(true);
    if (c.status === 'Novo') {
      handleCurriculoStatus(c.id, 'Lido');
      setDetailTarget({ ...c, status: 'Lido' });
    }
  }

  // ── mover para recrutamento ────────────────────────────────────────────────

  function openMover(c: Curriculo) {
    setMoverTarget(c);
    setMoverPosto(c.posto_id ?? (isAdmin ? '' : (selectedPostoId ?? '')));
    setMoverOpen(true);
  }

  async function handleMover() {
    if (!moverTarget) return;
    const postoId = isAdmin ? moverPosto : (selectedPostoId ?? '');
    if (!postoId) { toast.error('Selecione o posto'); return; }

    setSavingMover(true);

    const { data: inserted, error: insErr } = await (supabase as any)
      .from('pessoal_candidatos')
      .insert({
        posto_id: postoId,
        nome: moverTarget.nome,
        cpf: moverTarget.cpf,
        telefone: moverTarget.whatsapp,
        cargo_pretendido: moverTarget.cargo_desejado,
        observacoes: moverTarget.experiencia || null,
        status: 'Novo',
      })
      .select('id')
      .single();

    if (insErr) { toast.error('Erro ao criar candidato: ' + insErr.message); setSavingMover(false); return; }

    await (supabase as any)
      .from('publico_curriculos')
      .update({ candidato_id: inserted.id, status: 'Arquivado' })
      .eq('id', moverTarget.id);

    toast.success('Candidato criado no Recrutamento!');
    setMoverOpen(false);
    setMoverTarget(null);
    await loadCurriculos();
    setSavingMover(false);
  }

  // ── filtered data ──────────────────────────────────────────────────────────

  const filteredCurriculos = useMemo(() => curriculos.filter((c) => {
    if (cStatus !== '__all__' && c.status !== cStatus) return false;
    if (cSearch) {
      const q = cSearch.toLowerCase();
      if (!c.nome.toLowerCase().includes(q) && !c.cpf.includes(q) && !c.whatsapp.includes(q)) return false;
    }
    return true;
  }), [curriculos, cStatus, cSearch]);

  const filteredFeedbacks = useMemo(() => feedbacks.filter((f) => {
    if (fTipo !== '__all__' && f.tipo !== fTipo) return false;
    if (fStatus !== '__all__' && f.status !== fStatus) return false;
    if (fSearch) {
      const q = fSearch.toLowerCase();
      if (!(f.nome ?? '').toLowerCase().includes(q) && !f.mensagem.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [feedbacks, fTipo, fStatus, fSearch]);

  const paginaCurriculos = usePagination(filteredCurriculos, [cStatus, cSearch]);
  const paginaFeedbacks  = usePagination(filteredFeedbacks,  [fTipo, fStatus, fSearch]);

  const novosC = curriculos.filter((c) => c.status === 'Novo').length;
  const novosF = feedbacks.filter((f) => f.status === 'Novo').length;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <Tabs defaultValue="curriculos">
        <TabsList className="h-8">
          <TabsTrigger value="curriculos" className="text-xs gap-1.5">
            Currículos
            {novosC > 0 && (
              <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-[10px] h-4 min-w-[16px] px-1">
                {novosC}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="feedback" className="text-xs gap-1.5">
            Feedback
            {novosF > 0 && (
              <Badge className="bg-purple-600 hover:bg-purple-600 text-white text-[10px] h-4 min-w-[16px] px-1">
                {novosF}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Currículos ──────────────────────────────────────────────── */}
        <TabsContent value="curriculos" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, CPF ou WhatsApp..."
                className="h-8 text-xs pl-7 w-64"
                value={cSearch}
                onChange={(e) => setCSearch(e.target.value)}
              />
            </div>
            <Select value={cStatus} onValueChange={setCStatus}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {CURRICULO_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">CPF</TableHead>
                      <TableHead className="text-xs">Cargo</TableHead>
                      <TableHead className="text-xs">Posto</TableHead>
                      <TableHead className="text-xs">WhatsApp</TableHead>
                      <TableHead className="text-xs">Cidade</TableHead>
                      <TableHead className="text-xs">Bairro</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingCurriculos && (
                      <TableRow><TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                    )}
                    {!loadingCurriculos && paginaCurriculos.paginatedData.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">Nenhum currículo encontrado.</TableCell></TableRow>
                    )}
                    {paginaCurriculos.paginatedData.map((c) => (
                      <TableRow
                        key={c.id}
                        className="text-xs cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetail(c)}
                      >
                        <TableCell className="whitespace-nowrap">{formatDate(c.created_at)}</TableCell>
                        <TableCell className="font-medium max-w-[140px] truncate" title={c.nome}>{c.nome}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatCPF(c.cpf)}</TableCell>
                        <TableCell className="max-w-[110px] truncate" title={c.cargo_desejado}>{c.cargo_desejado}</TableCell>
                        <TableCell className="max-w-[110px] truncate" title={allPostos.find((p) => p.id === c.posto_id)?.nome ?? ''}>
                          {allPostos.find((p) => p.id === c.posto_id)?.nome ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{c.whatsapp}</TableCell>
                        <TableCell className="max-w-[100px] truncate" title={c.cidade ?? ''}>{c.cidade ?? '—'}</TableCell>
                        <TableCell className="max-w-[100px] truncate" title={c.bairro ?? ''}>{c.bairro ?? '—'}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={c.status} onValueChange={(v) => handleCurriculoStatus(c.id, v)}>
                            <SelectTrigger className="h-6 w-[150px] text-[11px] border-0 shadow-none p-0 gap-1">
                              <Badge className={`text-[10px] text-white font-normal ${CURRICULO_STATUS_COLORS[c.status] ?? 'bg-gray-400 hover:bg-gray-400'}`}>
                                {c.status}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {CURRICULO_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-block w-2 h-2 rounded-full ${CURRICULO_STATUS_COLORS[s]?.split(' ')[0]}`} />
                                    {s}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {c.candidato_id ? (
                              <Badge className="bg-emerald-700 hover:bg-emerald-700 text-white text-[10px]">No Recrutamento</Badge>
                            ) : (
                              <Button
                                variant="outline" size="sm" className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                                onClick={() => openMover(c)}
                              >
                                <UserPlus className="w-3 h-3" />
                                Recrutar
                              </Button>
                            )}
                            {isAdmin && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                onClick={() => setDeleteTarget({ type: 'curriculo', id: c.id, path: c.arquivo_path })}
                                title="Excluir currículo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <PaginationControls
                page={paginaCurriculos.page} totalPages={paginaCurriculos.totalPages}
                pageSize={paginaCurriculos.pageSize} totalItems={paginaCurriculos.totalItems}
                startIndex={paginaCurriculos.startIndex} endIndex={paginaCurriculos.endIndex}
                onPageChange={paginaCurriculos.setPage} onPageSizeChange={paginaCurriculos.handlePageSizeChange}
                itemLabel="currículos"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Feedback ────────────────────────────────────────────────── */}
        <TabsContent value="feedback" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou mensagem..."
                className="h-8 text-xs pl-7 w-56"
                value={fSearch}
                onChange={(e) => setFSearch(e.target.value)}
              />
            </div>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="Elogio">Elogio</SelectItem>
                <SelectItem value="Sugestão">Sugestão</SelectItem>
                <SelectItem value="Crítica">Crítica</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {FEEDBACK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Data</TableHead>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Mensagem</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      {isAdmin && <TableHead className="text-xs w-10"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingFeedbacks && (
                      <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                    )}
                    {!loadingFeedbacks && paginaFeedbacks.paginatedData.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">Nenhum feedback encontrado.</TableCell></TableRow>
                    )}
                    {paginaFeedbacks.paginatedData.map((f) => (
                      <TableRow key={f.id} className="text-xs">
                        <TableCell className="whitespace-nowrap">{formatDate(f.created_at)}</TableCell>
                        <TableCell>{f.nome ?? <span className="text-muted-foreground italic">Anônimo</span>}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] text-white ${FEEDBACK_TYPE_COLORS[f.tipo] ?? 'bg-gray-400 hover:bg-gray-400'}`}>
                            {f.tipo}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[320px]">
                          <p className="truncate" title={f.mensagem}>{f.mensagem}</p>
                        </TableCell>
                        <TableCell>
                          <Select value={f.status} onValueChange={(v) => handleFeedbackStatus(f.id, v)}>
                            <SelectTrigger className="h-6 w-[95px] text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FEEDBACK_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                              onClick={() => setDeleteTarget({ type: 'feedback', id: f.id })}
                              title="Excluir feedback"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <PaginationControls
                page={paginaFeedbacks.page} totalPages={paginaFeedbacks.totalPages}
                pageSize={paginaFeedbacks.pageSize} totalItems={paginaFeedbacks.totalItems}
                startIndex={paginaFeedbacks.startIndex} endIndex={paginaFeedbacks.endIndex}
                onPageChange={paginaFeedbacks.setPage} onPageSizeChange={paginaFeedbacks.handlePageSizeChange}
                itemLabel="feedbacks"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Detalhe do Currículo ─────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={(o) => { if (!o) setDetailOpen(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Currículo — {detailTarget?.nome}</DialogTitle>
          </DialogHeader>
          {detailTarget && (() => {
            const exps = parseExperiencias(detailTarget.experiencia);
            return (
              <div className="space-y-4 py-1 text-sm">
                {/* Dados pessoais */}
                <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1.5 text-xs">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{detailTarget.nome}</span></div>
                    <div><span className="text-muted-foreground">CPF:</span> {formatCPF(detailTarget.cpf)}</div>
                    <div><span className="text-muted-foreground">RG:</span> {detailTarget.rg ?? '—'}</div>
                    <div><span className="text-muted-foreground">WhatsApp:</span> {detailTarget.whatsapp}</div>
                    <div><span className="text-muted-foreground">Cidade:</span> {detailTarget.cidade ?? '—'}</div>
                    <div><span className="text-muted-foreground">Bairro:</span> {detailTarget.bairro ?? '—'}</div>
                    <div className="col-span-2"><span className="text-muted-foreground">Cargo desejado:</span> <span className="font-medium">{detailTarget.cargo_desejado}</span></div>
                    {detailTarget.posto_id && (
                      <div className="col-span-2"><span className="text-muted-foreground">Posto desejado:</span> <span className="font-medium">{allPostos.find((p) => p.id === detailTarget.posto_id)?.nome ?? detailTarget.posto_id}</span></div>
                    )}
                  </div>
                </div>

                {/* Experiências */}
                {exps.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Experiências anteriores</p>
                    {exps.map((e, i) => (
                      <div key={i} className="rounded-md border px-3 py-2 space-y-0.5 text-xs">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-semibold text-slate-500 text-[11px]">{i + 1}.</span>
                          <span className="font-medium">{e.cargo}</span>
                          {e.empresa && <span className="text-muted-foreground">· {e.empresa}</span>}
                        </div>
                        {(e.inicio || e.fim) && (
                          <p className="text-muted-foreground pl-4">
                            {[e.inicio, e.fim].filter(Boolean).join(' → ')}
                          </p>
                        )}
                        {e.descricao && <p className="pl-4 text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{e.descricao}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {exps.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Nenhuma experiência informada.</p>
                )}

                {/* Arquivo */}
                {detailTarget.arquivo_path && (
                  <Button
                    variant="outline" size="sm" className="gap-1.5 text-xs"
                    onClick={() => handleVerArquivo(detailTarget.arquivo_path!)}
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    Ver currículo anexado
                  </Button>
                )}
              </div>
            );
          })()}
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDetailOpen(false)}>Fechar</Button>
            {detailTarget && !detailTarget.candidato_id && (
              <Button
                size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5"
                onClick={() => { setDetailOpen(false); openMover(detailTarget); }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                Mover para Recrutamento
              </Button>
            )}
            {detailTarget?.candidato_id && (
              <Badge className="bg-emerald-700 hover:bg-emerald-700 text-white text-xs self-center">Já no Recrutamento</Badge>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmação de exclusão ──────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'curriculo'
                ? 'Tem certeza que deseja excluir este currículo?'
                : 'Tem certeza que deseja excluir este feedback?'}
              {' '}Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Mover para Recrutamento Dialog ───────────────────────────── */}
      <Dialog open={moverOpen} onOpenChange={(o) => !o && setMoverOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-green-600" />
              Mover para Recrutamento
            </DialogTitle>
          </DialogHeader>
          {moverTarget && (
            <div className="space-y-3 py-1">
              <div className="rounded-md bg-muted/40 border px-3 py-2 text-xs space-y-0.5">
                <div><span className="text-muted-foreground">Nome:</span> <span className="font-medium">{moverTarget.nome}</span></div>
                <div><span className="text-muted-foreground">CPF:</span> {formatCPF(moverTarget.cpf)}</div>
                <div><span className="text-muted-foreground">Cargo:</span> {moverTarget.cargo_desejado}</div>
                <div><span className="text-muted-foreground">WhatsApp:</span> {moverTarget.whatsapp}</div>
                {moverTarget.experiencia && (
                  <div className="mt-1 pt-1 border-t">
                    <span className="text-muted-foreground">Experiência:</span>
                    <p className="mt-0.5 line-clamp-3">{moverTarget.experiencia}</p>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="space-y-1">
                  <Label className="text-xs">Posto *</Label>
                  <Select value={moverPosto} onValueChange={setMoverPosto}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar posto" /></SelectTrigger>
                    <SelectContent>
                      {allPostos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMoverOpen(false)}>Cancelar</Button>
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleMover} disabled={savingMover}>
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              {savingMover ? 'Criando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
