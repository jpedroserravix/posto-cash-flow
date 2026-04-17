import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, X, Save, Upload, FileText, UserX, UserCheck, Search } from 'lucide-react';
import { openInNewTab } from '@/lib/utils';
import FuncionarioTreinamentos from './FuncionarioTreinamentos';

// ─── types ──────────────────────────────────────────────────────────────────

type FuncStatus = 'ativo' | 'desligado';

interface Funcionario {
  id: string;
  posto_id: string;
  nome: string;
  cpf: string;
  cargo: string;
  data_admissao: string;
  data_nascimento: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  status: FuncStatus;
  created_at: string;
}

interface Desligamento {
  id: string;
  funcionario_id: string;
  data_desligamento: string;
  motivo: string;
  observacoes: string | null;
  arquivo_path: string | null;
}

interface FuncDocumento {
  id: string;
  funcionario_id: string;
  tipo: string;
  nome_arquivo: string;
  arquivo_path: string;
  observacoes: string | null;
  created_at: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatCPF(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function rawCPF(masked: string) {
  return masked.replace(/\D/g, '');
}

function formatDate(str: string | null) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

const CARGOS = [
  'Auxiliar Administrativo',
  'Chefe de Pista',
  'Frentista',
  'Funcionário de Loja',
  'Gerente',
  'Repositor de Loja',
  'Secretária Administrativa',
  'Trocador de Óleo',
  'Outros',
];
const TIPOS_DOC = ['RG', 'CPF', 'CNH', 'Carteira de Trabalho', 'Contrato de Experiência', 'Atestado Médico', 'Outros'];

const EMPTY_FORM = {
  nome: '',
  cpf: '',
  cargo: '',
  data_admissao: '',
  data_nascimento: '',
  telefone: '',
  email: '',
  observacoes: '',
};

// ─── badge types ────────────────────────────────────────────────────────────

interface CursoSummary {
  id: string;
  obrigatorio: boolean;
  cargos_obrigatorios: string[];
  validade_meses: number | null;
}

interface TreinamentoSummary {
  funcionario_id: string;
  curso_id: string;
  data_conclusao: string | null;
  data_vencimento: string | null;
}

// ─── CPF duplicate check warning ────────────────────────────────────────────

interface CPFWarning {
  show: boolean;
  funcionarios: Funcionario[];
}

// ─── main component ─────────────────────────────────────────────────────────

export default function Funcionarios() {
  const { selectedPostoId, allPostos, hasPermission } = useAuth();

  // Admin can pick posto
  const showPostoSelector = allPostos.length > 0;
  const [localPostoId, setLocalPostoId] = useState<string>(selectedPostoId ?? '');
  useEffect(() => { if (selectedPostoId) setLocalPostoId(selectedPostoId); }, [selectedPostoId]);
  const postoId = showPostoSelector ? localPostoId : (selectedPostoId ?? '');

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(false);

  // filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | FuncStatus>('ativo');

  // main dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Funcionario | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // CPF warning
  const [cpfWarning, setCpfWarning] = useState<CPFWarning>({ show: false, funcionarios: [] });
  const cpfCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // desligamento dialog
  const [desligOpen, setDesligOpen] = useState(false);
  const [desligTarget, setDesligTarget] = useState<Funcionario | null>(null);
  const [desligForm, setDesligForm] = useState({ data: '', motivo: '', observacoes: '' });
  const [desligFile, setDesligFile] = useState<File | null>(null);
  const [desligSaving, setDesligSaving] = useState(false);

  // reativar confirm
  const [reativarTarget, setReativarTarget] = useState<Funcionario | null>(null);

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Funcionario | null>(null);

  // detail dialog (documentos)
  const [detailTarget, setDetailTarget] = useState<Funcionario | null>(null);
  const [docList, setDocList] = useState<FuncDocumento[]>([]);
  const [docLoading, setDocLoading] = useState(false);
  const [docUploadTipo, setDocUploadTipo] = useState('');
  const [docUploadFile, setDocUploadFile] = useState<File | null>(null);
  const [docUploadObs, setDocUploadObs] = useState('');
  const [docUploading, setDocUploading] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);

  // training badge state
  const [badgeCursos, setBadgeCursos] = useState<CursoSummary[]>([]);
  const [badgeTreinamentos, setBadgeTreinamentos] = useState<TreinamentoSummary[]>([]);

  // ─── load ──────────────────────────────────────────────────────────────────

  async function loadBadgeData(funcList: Funcionario[]) {
    if (funcList.length === 0) { setBadgeCursos([]); setBadgeTreinamentos([]); return; }
    const [{ data: cs }, { data: ts }] = await Promise.all([
      (supabase as any).from('cursos').select('id, obrigatorio, cargos_obrigatorios, validade_meses'),
      (supabase as any)
        .from('funcionario_treinamentos')
        .select('funcionario_id, curso_id, data_conclusao, data_vencimento')
        .in('funcionario_id', funcList.map((f) => f.id)),
    ]);
    setBadgeCursos(cs ?? []);
    setBadgeTreinamentos(ts ?? []);
  }

  function getPendingTotal(f: Funcionario): number {
    const today = new Date().toISOString().slice(0, 10);
    const required = badgeCursos.filter(
      (c) => c.obrigatorio && c.cargos_obrigatorios?.includes(f.cargo)
    );
    let count = 0;
    for (const curso of required) {
      const t = badgeTreinamentos.find(
        (t) => t.funcionario_id === f.id && t.curso_id === curso.id
      );
      if (!t || !t.data_conclusao) { count++; continue; }
      if (t.data_vencimento && t.data_vencimento < today) count++;
    }
    return count;
  }

  async function load() {
    if (!postoId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('pessoal_funcionarios')
      .select('*')
      .eq('posto_id', postoId)
      .order('nome');
    if (error) { toast.error('Erro ao carregar funcionários'); }
    else {
      const funcList = data ?? [];
      setFuncionarios(funcList);
      await loadBadgeData(funcList);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [postoId]);

  // ─── filtered list ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return funcionarios.filter((f) => {
      if (statusFilter !== 'todos' && f.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!f.nome.toLowerCase().includes(q) && !f.cpf.includes(q) && !f.cargo.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [funcionarios, search, statusFilter]);

  const { page, setPage, pageSize, handlePageSizeChange, paginatedData, totalPages, totalItems, startIndex, endIndex } =
    usePagination(filtered, [search, statusFilter, postoId], { sessionKey: 'func_pageSize' });

  // ─── CPF check ─────────────────────────────────────────────────────────────

  function handleCPFChange(raw: string) {
    const masked = formatCPF(raw);
    setForm((f) => ({ ...f, cpf: masked }));

    if (cpfCheckTimer.current) clearTimeout(cpfCheckTimer.current);

    const digits = rawCPF(masked);
    if (digits.length < 11) { setCpfWarning({ show: false, funcionarios: [] }); return; }

    cpfCheckTimer.current = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from('pessoal_funcionarios')
        .select('*')
        .eq('cpf', digits)
        .neq('id', editTarget?.id ?? '');
      if (data && data.length > 0) {
        setCpfWarning({ show: true, funcionarios: data });
      } else {
        setCpfWarning({ show: false, funcionarios: [] });
      }
    }, 400);
  }

  // ─── save funcionario ──────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.nome.trim() || !form.cpf || rawCPF(form.cpf).length < 11) {
      toast.error('Preencha Nome e CPF válido');
      return;
    }
    if (!postoId) return;
    setSaving(true);

    const payload = {
      posto_id: postoId,
      nome: form.nome.trim(),
      cpf: rawCPF(form.cpf),
      cargo: form.cargo,
      data_admissao: form.data_admissao,
      data_nascimento: form.data_nascimento || null,
      telefone: form.telefone || null,
      email: form.email || null,
      observacoes: form.observacoes || null,
    };

    let error;
    if (editTarget) {
      ({ error } = await (supabase as any).from('pessoal_funcionarios').update(payload).eq('id', editTarget.id));
    } else {
      ({ error } = await (supabase as any).from('pessoal_funcionarios').insert({ ...payload, status: 'ativo' }));
    }

    if (error) { toast.error('Erro ao salvar: ' + error.message); }
    else { toast.success(editTarget ? 'Funcionário atualizado' : 'Funcionário cadastrado'); setDialogOpen(false); await load(); }
    setSaving(false);
  }

  // ─── desligamento ──────────────────────────────────────────────────────────

  async function handleDesligar() {
    if (!desligTarget || !desligForm.data || !desligForm.motivo) {
      toast.error('Preencha data e motivo do desligamento');
      return;
    }
    setDesligSaving(true);

    let arquivo_path: string | null = null;
    if (desligFile) {
      const ext = desligFile.name.split('.').pop();
      const path = `desligamentos/${desligTarget.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('pessoal-documentos').upload(path, desligFile);
      if (upErr) { toast.error('Erro ao enviar arquivo'); setDesligSaving(false); return; }
      arquivo_path = path;
    }

    const { error: dErr } = await (supabase as any).from('pessoal_desligamentos').insert({
      funcionario_id: desligTarget.id,
      data_desligamento: desligForm.data,
      motivo: desligForm.motivo,
      observacoes: desligForm.observacoes || null,
      arquivo_path,
    });

    if (dErr) { toast.error('Erro ao registrar desligamento'); setDesligSaving(false); return; }

    const { error: uErr } = await (supabase as any)
      .from('pessoal_funcionarios').update({ status: 'desligado' }).eq('id', desligTarget.id);

    if (uErr) { toast.error('Erro ao atualizar status'); }
    else { toast.success('Funcionário desligado'); setDesligOpen(false); setDesligTarget(null); await load(); }
    setDesligSaving(false);
  }

  // ─── reativar ──────────────────────────────────────────────────────────────

  async function handleReativar() {
    if (!reativarTarget) return;
    const { error } = await (supabase as any)
      .from('pessoal_funcionarios').update({ status: 'ativo' }).eq('id', reativarTarget.id);
    if (error) { toast.error('Erro ao reativar'); }
    else { toast.success('Funcionário reativado'); setReativarTarget(null); await load(); }
  }

  // ─── delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await (supabase as any).from('pessoal_funcionarios').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Erro ao excluir'); }
    else { toast.success('Funcionário excluído'); setDeleteTarget(null); await load(); }
  }

  // ─── docs ──────────────────────────────────────────────────────────────────

  async function loadDocs(funcId: string) {
    setDocLoading(true);
    const { data } = await (supabase as any)
      .from('pessoal_documentos')
      .select('*')
      .eq('funcionario_id', funcId)
      .order('created_at', { ascending: false });
    setDocList(data ?? []);
    setDocLoading(false);
  }

  async function handleDocUpload() {
    if (!detailTarget || !docUploadTipo || !docUploadFile) {
      toast.error('Selecione o tipo e o arquivo');
      return;
    }
    setDocUploading(true);
    const ext = docUploadFile.name.split('.').pop();
    const path = `documentos/${detailTarget.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('pessoal-documentos').upload(path, docUploadFile);
    if (upErr) { toast.error('Erro ao enviar arquivo'); setDocUploading(false); return; }

    const { error } = await (supabase as any).from('pessoal_documentos').insert({
      funcionario_id: detailTarget.id,
      tipo: docUploadTipo,
      nome_arquivo: docUploadFile.name,
      arquivo_path: path,
      observacoes: docUploadObs || null,
    });
    if (error) { toast.error('Erro ao salvar documento'); }
    else {
      toast.success('Documento enviado');
      setDocUploadTipo(''); setDocUploadFile(null); setDocUploadObs('');
      if (docFileRef.current) docFileRef.current.value = '';
      await loadDocs(detailTarget.id);
    }
    setDocUploading(false);
  }

  async function handleDocDelete(doc: FuncDocumento) {
    await supabase.storage.from('pessoal-documentos').remove([doc.arquivo_path]);
    await (supabase as any).from('pessoal_documentos').delete().eq('id', doc.id);
    toast.success('Documento removido');
    if (detailTarget) await loadDocs(detailTarget.id);
  }

  function getDocUrl(path: string) {
    const { data } = supabase.storage.from('pessoal-documentos').getPublicUrl(path);
    openInNewTab(data.publicUrl);
  }

  // ─── open dialog helpers ───────────────────────────────────────────────────

  function openNew() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setCpfWarning({ show: false, funcionarios: [] });
    setDialogOpen(true);
  }

  function openEdit(f: Funcionario) {
    setEditTarget(f);
    setForm({
      nome: f.nome,
      cpf: formatCPF(f.cpf),
      cargo: f.cargo,
      data_admissao: f.data_admissao,
      data_nascimento: f.data_nascimento ?? '',
      telefone: f.telefone ?? '',
      email: f.email ?? '',
      observacoes: f.observacoes ?? '',
    });
    setCpfWarning({ show: false, funcionarios: [] });
    setDialogOpen(true);
  }

  function openDesligar(f: Funcionario) {
    setDesligTarget(f);
    setDesligForm({ data: '', motivo: '', observacoes: '' });
    setDesligFile(null);
    setDesligOpen(true);
  }

  function openDetail(f: Funcionario) {
    setDetailTarget(f);
    loadDocs(f.id);
  }

  // ─── render ────────────────────────────────────────────────────────────────

  if (!postoId) {
    return <div className="text-center text-muted-foreground py-16">Selecione um posto no cabeçalho.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          {showPostoSelector && (
            <Select value={localPostoId} onValueChange={setLocalPostoId}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Posto" />
              </SelectTrigger>
              <SelectContent>
                {allPostos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CPF ou cargo..."
              className="h-8 text-xs pl-7 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="desligado">Desligados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={openNew}>
          <Plus className="w-3.5 h-3.5" /> Novo Funcionário
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">CPF</TableHead>
                  <TableHead className="text-xs">Cargo</TableHead>
                  <TableHead className="text-xs">Admissão</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                )}
                {!loading && paginatedData.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">Nenhum funcionário encontrado.</TableCell></TableRow>
                )}
                {paginatedData.map((f) => (
                  <TableRow key={f.id} className="text-xs">
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          className="font-medium hover:underline text-left"
                          onClick={() => openDetail(f)}
                        >
                          {f.nome}
                        </button>
                        {(() => {
                          const total = getPendingTotal(f);
                          if (total === 0) return null;
                          return (
                            <Badge className="bg-red-500 hover:bg-red-500 text-white text-[10px]">
                              {total} {total === 1 ? 'pendente' : 'pendentes'}
                            </Badge>
                          );
                        })()}
                      </div>
                    </TableCell>
                    <TableCell>{formatCPF(f.cpf)}</TableCell>
                    <TableCell>{f.cargo}</TableCell>
                    <TableCell>{formatDate(f.data_admissao)}</TableCell>
                    <TableCell>
                      {f.status === 'ativo'
                        ? <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px]">Ativo</Badge>
                        : <Badge className="bg-gray-400 hover:bg-gray-400 text-white text-[10px]">Desligado</Badge>
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)} title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {f.status === 'ativo' ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-600" onClick={() => openDesligar(f)} title="Desligar">
                            <UserX className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => setReativarTarget(f)} title="Reativar">
                            <UserCheck className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(f)} title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={page} totalPages={totalPages} pageSize={pageSize}
            totalItems={totalItems} startIndex={startIndex} endIndex={endIndex}
            onPageChange={setPage} onPageSizeChange={handlePageSizeChange}
            itemLabel="funcionários"
          />
        </CardContent>
      </Card>

      {/* ── New/Edit Dialog ───────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar Funcionário' : 'Novo Funcionário'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Nome completo *</Label>
                <Input className="h-8 text-xs" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CPF *</Label>
                <Input className="h-8 text-xs" placeholder="000.000.000-00" value={form.cpf} onChange={(e) => handleCPFChange(e.target.value)} />
                {cpfWarning.show && (
                  <div className="rounded border border-yellow-400 bg-yellow-50 p-2 text-xs text-yellow-800">
                    CPF já cadastrado para:
                    {cpfWarning.funcionarios.map((fw) => (
                      <div key={fw.id} className="font-medium">
                        {fw.nome} — {fw.status === 'desligado' ? 'Desligado em ' + formatDate(fw.data_admissao) : 'Ativo'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cargo *</Label>
                <Select value={form.cargo} onValueChange={(v) => setForm((f) => ({ ...f, cargo: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Admissão *</Label>
                <Input type="date" className="h-8 text-xs" value={form.data_admissao} onChange={(e) => setForm((f) => ({ ...f, data_admissao: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Nascimento</Label>
                <Input type="date" className="h-8 text-xs" value={form.data_nascimento} onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefone</Label>
                <Input className="h-8 text-xs" value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">E-mail</Label>
                <Input className="h-8 text-xs" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Observações</Label>
                <Textarea className="text-xs min-h-[60px]" value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Desligamento Dialog ───────────────────────────────────────────── */}
      <Dialog open={desligOpen} onOpenChange={setDesligOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Desligamento — {desligTarget?.nome}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Data de Desligamento *</Label>
              <Input type="date" className="h-8 text-xs" value={desligForm.data} onChange={(e) => setDesligForm((f) => ({ ...f, data: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo *</Label>
              <Select value={desligForm.motivo} onValueChange={(v) => setDesligForm((f) => ({ ...f, motivo: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Demissão sem justa causa">Demissão sem justa causa</SelectItem>
                  <SelectItem value="Demissão com justa causa">Demissão com justa causa</SelectItem>
                  <SelectItem value="Pedido de demissão">Pedido de demissão</SelectItem>
                  <SelectItem value="Aposentadoria">Aposentadoria</SelectItem>
                  <SelectItem value="Contrato encerrado">Contrato encerrado</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea className="text-xs min-h-[60px]" value={desligForm.observacoes} onChange={(e) => setDesligForm((f) => ({ ...f, observacoes: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Documento (opcional)</Label>
              <Input type="file" className="h-8 text-xs" onChange={(e) => setDesligFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDesligOpen(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={handleDesligar} disabled={desligSaving}>
              <UserX className="w-3.5 h-3.5 mr-1" />{desligSaving ? 'Salvando...' : 'Confirmar Desligamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reativar Confirm ─────────────────────────────────────────────── */}
      <AlertDialog open={!!reativarTarget} onOpenChange={(o) => !o && setReativarTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar funcionário?</AlertDialogTitle>
            <AlertDialogDescription>
              {reativarTarget?.nome} será marcado como ativo novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReativar}>Reativar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Confirm ───────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir funcionário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível e removerá todos os dados de {deleteTarget?.nome}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Detail Dialog (documentos + treinamentos) ───────────────────── */}
      <Dialog
        open={!!detailTarget}
        onOpenChange={(o) => {
          if (!o) {
            setDetailTarget(null);
            loadBadgeData(funcionarios);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailTarget?.nome}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="docs">
            <TabsList className="h-8">
              <TabsTrigger value="docs" className="text-xs">Documentos</TabsTrigger>
              <TabsTrigger value="treinamentos" className="text-xs">Treinamentos</TabsTrigger>
            </TabsList>
            <TabsContent value="treinamentos" className="mt-3">
              {detailTarget && (
                <FuncionarioTreinamentos
                  funcionarioId={detailTarget.id}
                  cargo={detailTarget.cargo}
                  onUpdate={() => loadBadgeData(funcionarios)}
                />
              )}
            </TabsContent>
            <TabsContent value="docs" className="mt-3">
              {/* upload form */}
              <div className="flex gap-2 flex-wrap items-end mb-4 p-3 bg-muted/40 rounded">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo *</Label>
                  <Select value={docUploadTipo} onValueChange={setDocUploadTipo}>
                    <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_DOC.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 flex-1 min-w-[160px]">
                  <Label className="text-xs">Arquivo *</Label>
                  <Input ref={docFileRef} type="file" className="h-8 text-xs" onChange={(e) => setDocUploadFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1 flex-1 min-w-[160px]">
                  <Label className="text-xs">Observações</Label>
                  <Input className="h-8 text-xs" value={docUploadObs} onChange={(e) => setDocUploadObs(e.target.value)} />
                </div>
                <Button size="sm" className="h-8 text-xs" onClick={handleDocUpload} disabled={docUploading}>
                  <Upload className="w-3.5 h-3.5 mr-1" />{docUploading ? 'Enviando...' : 'Enviar'}
                </Button>
              </div>

              {/* doc list */}
              {docLoading ? (
                <div className="text-xs text-muted-foreground py-4 text-center">Carregando...</div>
              ) : docList.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">Nenhum documento enviado.</div>
              ) : (
                <div className="space-y-2">
                  {docList.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 text-xs border rounded p-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{doc.tipo}</div>
                        <div className="text-muted-foreground truncate">{doc.nome_arquivo}</div>
                        {doc.observacoes && <div className="text-muted-foreground">{doc.observacoes}</div>}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => getDocUrl(doc.arquivo_path)} title="Ver">
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDocDelete(doc)} title="Remover">
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
