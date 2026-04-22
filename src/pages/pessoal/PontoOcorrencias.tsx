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
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Save, FileText } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { openInNewTab } from '@/lib/utils';
import { ObsTooltip } from '@/components/ObsTooltip';

// ─── types ──────────────────────────────────────────────────────────────────

interface Funcionario {
  id: string;
  nome: string;
  status: 'ativo' | 'desligado';
}

type OcorrenciaTipo =
  | 'Advertência'
  | 'Atestado'
  | 'Atraso'
  | 'Bonificação'
  | 'Dano/Prejuízo'
  | 'Desconto Quebra de Caixa'
  | 'Falta'
  | 'Hora Extra'
  | 'Observação'
  | 'Quebra de Caixa (Crédito)'
  | 'Suspensão'
  | 'Vale Funcionário';

interface Ocorrencia {
  id: string;
  funcionario_id: string;
  posto_id: string;
  data: string;
  tipo: OcorrenciaTipo;
  descricao: string | null;
  horas: number | null;
  valor: number | null;
  arquivo_path: string | null;
  created_at: string;
  pessoal_funcionarios?: { nome: string };
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(str: string | null) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function formatBRL(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Alphabetical order
const TIPOS: OcorrenciaTipo[] = [
  'Advertência',
  'Atestado',
  'Atraso',
  'Bonificação',
  'Dano/Prejuízo',
  'Desconto Quebra de Caixa',
  'Falta',
  'Hora Extra',
  'Observação',
  'Quebra de Caixa (Crédito)',
  'Suspensão',
  'Vale Funcionário',
];

// Types that require a BRL value
const FINANCIAL_TIPOS: OcorrenciaTipo[] = ['Bonificação', 'Dano/Prejuízo', 'Desconto Quebra de Caixa', 'Quebra de Caixa (Crédito)', 'Vale Funcionário'];

function isFinanceiro(tipo: OcorrenciaTipo | ''): boolean {
  return FINANCIAL_TIPOS.includes(tipo as OcorrenciaTipo);
}

const TIPO_COLORS: Record<OcorrenciaTipo, string> = {
  'Advertência':              'bg-yellow-500',
  'Atestado':                 'bg-purple-500',
  'Atraso':                   'bg-orange-400',
  'Bonificação':              'bg-green-500',
  'Dano/Prejuízo':            'bg-red-600',
  'Desconto Quebra de Caixa': 'bg-orange-600',
  'Falta':                    'bg-red-500',
  'Hora Extra':               'bg-blue-500',
  'Observação':               'bg-gray-400',
  'Quebra de Caixa (Crédito)':'bg-teal-600',
  'Suspensão':                'bg-red-700',
  'Vale Funcionário':         'bg-red-400',
};

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const EMPTY_FORM = {
  funcionario_id: '',
  data: '',
  tipo: '' as OcorrenciaTipo | '',
  descricao: '',
  horas: '',
  valor: '',
};

// ─── main component ─────────────────────────────────────────────────────────

export default function PontoOcorrencias() {
  const { selectedPostoId, allPostos } = useAuth();

  const showPostoSelector = allPostos.length > 0;
  const [localPostoId, setLocalPostoId] = useState<string>(selectedPostoId ?? '');
  useEffect(() => { if (selectedPostoId) setLocalPostoId(selectedPostoId); }, [selectedPostoId]);
  const postoId = showPostoSelector ? localPostoId : (selectedPostoId ?? '');

  const now = new Date();
  const [filterMes, setFilterMes] = useState(String(now.getMonth() + 1));
  const [filterAno, setFilterAno] = useState(String(now.getFullYear()));
  const [filterFunc, setFilterFunc] = useState('todos');
  const [filterTipo, setFilterTipo] = useState('todos');

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Ocorrencia | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedFuncs, setSelectedFuncs] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<Ocorrencia | null>(null);

  // ─── load funcionarios ─────────────────────────────────────────────────────

  async function loadFuncionarios() {
    if (!postoId) return;
    const { data } = await (supabase as any)
      .from('pessoal_funcionarios')
      .select('id, nome, status')
      .eq('posto_id', postoId)
      .order('nome');
    setFuncionarios(data ?? []);
  }

  // ─── load ocorrencias ──────────────────────────────────────────────────────

  async function load() {
    if (!postoId) return;
    setLoading(true);
    const mes = filterMes.padStart(2, '0');
    const startDate = `${filterAno}-${mes}-01`;
    const lastDay = new Date(Number(filterAno), Number(filterMes), 0).getDate();
    const endDate = `${filterAno}-${mes}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await (supabase as any)
      .from('pessoal_ocorrencias')
      .select('*, pessoal_funcionarios(nome)')
      .eq('posto_id', postoId)
      .gte('data', startDate)
      .lte('data', endDate)
      .order('data', { ascending: false });

    if (error) { toast.error('Erro ao carregar ocorrências'); }
    else { setOcorrencias(data ?? []); }
    setLoading(false);
  }

  useEffect(() => { loadFuncionarios(); }, [postoId]);
  useEffect(() => { load(); }, [postoId, filterMes, filterAno]);

  // ─── filtered + summary ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return ocorrencias.filter((o) => {
      if (filterFunc !== 'todos' && o.funcionario_id !== filterFunc) return false;
      if (filterTipo !== 'todos' && o.tipo !== filterTipo) return false;
      return true;
    });
  }, [ocorrencias, filterFunc, filterTipo]);

  const summary = useMemo(() => {
    const result: Record<OcorrenciaTipo, { count: number; total: number }> = {} as any;
    TIPOS.forEach((t) => { result[t] = { count: 0, total: 0 }; });
    filtered.forEach((o) => {
      if (result[o.tipo]) {
        result[o.tipo].count += 1;
        result[o.tipo].total += o.valor ?? 0;
      }
    });
    return result;
  }, [filtered]);

  const { page, setPage, pageSize, handlePageSizeChange, paginatedData, totalPages, totalItems, startIndex, endIndex } =
    usePagination(filtered, [filterFunc, filterTipo, filterMes, filterAno, postoId], { sessionKey: 'ponto_pageSize' });

  // ─── save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (editTarget && !form.funcionario_id) {
      toast.error('Preencha funcionário, data e tipo');
      return;
    }
    if (!editTarget && selectedFuncs.size === 0) {
      toast.error('Selecione ao menos um funcionário');
      return;
    }
    if (!form.data || !form.tipo) {
      toast.error('Preencha data e tipo');
      return;
    }
    if (isFinanceiro(form.tipo) && (!form.valor || isNaN(parseFloat(form.valor)))) {
      toast.error('Informe o valor para este tipo de ocorrência');
      return;
    }
    if (!editTarget && selectedFuncs.size > 1 && file) {
      toast.error('Arquivo não pode ser enviado para múltiplos funcionários');
      return;
    }
    setSaving(true);

    let arquivo_path: string | null = editTarget?.arquivo_path ?? null;

    if (file) {
      const funcId = editTarget ? form.funcionario_id : [...selectedFuncs][0];
      const ext = file.name.split('.').pop();
      const path = `ocorrencias/${funcId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('pessoal-documentos').upload(path, file);
      if (upErr) { toast.error('Erro ao enviar arquivo'); setSaving(false); return; }
      arquivo_path = path;
    }

    const basePayload = {
      posto_id: postoId,
      data: form.data,
      tipo: form.tipo,
      descricao: form.descricao || null,
      horas: (form.tipo === 'Atraso' || form.tipo === 'Hora Extra') && form.horas ? parseFloat(form.horas) : null,
      valor: isFinanceiro(form.tipo) && form.valor ? parseFloat(form.valor) : null,
      arquivo_path,
    };

    let error;
    if (editTarget) {
      ({ error } = await (supabase as any).from('pessoal_ocorrencias').update({ ...basePayload, funcionario_id: form.funcionario_id }).eq('id', editTarget.id));
    } else if (selectedFuncs.size === 1) {
      ({ error } = await (supabase as any).from('pessoal_ocorrencias').insert({ ...basePayload, funcionario_id: [...selectedFuncs][0] }));
    } else {
      const records = [...selectedFuncs].map((fid) => ({ ...basePayload, funcionario_id: fid }));
      ({ error } = await (supabase as any).from('pessoal_ocorrencias').insert(records));
    }

    if (error) { toast.error('Erro ao salvar'); }
    else {
      const count = editTarget ? 1 : selectedFuncs.size;
      toast.success(editTarget ? 'Ocorrência atualizada' : `${count} ocorrência${count > 1 ? 's' : ''} registrada${count > 1 ? 's' : ''}`);
      setDialogOpen(false);
      await load();
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.arquivo_path) {
      await supabase.storage.from('pessoal-documentos').remove([deleteTarget.arquivo_path]);
    }
    const { error } = await (supabase as any).from('pessoal_ocorrencias').delete().eq('id', deleteTarget.id);
    if (error) { toast.error('Erro ao excluir'); }
    else { toast.success('Ocorrência excluída'); setDeleteTarget(null); await load(); }
  }

  function getFileUrl(path: string) {
    const { data } = supabase.storage.from('pessoal-documentos').getPublicUrl(path);
    openInNewTab(data.publicUrl);
  }

  // ─── open dialog ───────────────────────────────────────────────────────────

  function openNew() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setSelectedFuncs(new Set());
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setDialogOpen(true);
  }

  function openEdit(o: Ocorrencia) {
    setEditTarget(o);
    setForm({
      funcionario_id: o.funcionario_id,
      data: o.data,
      tipo: o.tipo,
      descricao: o.descricao ?? '',
      horas: o.horas != null ? String(o.horas) : '',
      valor: o.valor != null ? String(o.valor) : '',
    });
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setDialogOpen(true);
  }

  const funcName = (id: string) => funcionarios.find((f) => f.id === id)?.nome ?? id;

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 2 + i));

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
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Posto" /></SelectTrigger>
              <SelectContent>{allPostos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={filterMes} onValueChange={setFilterMes}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAno} onValueChange={setFilterAno}>
            <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterFunc} onValueChange={setFilterFunc}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Funcionário" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos funcionários</SelectItem>
              {funcionarios.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={openNew}>
          <Plus className="w-3.5 h-3.5" /> Nova Ocorrência
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-2">
        {TIPOS.map((tipo) => (
          <Card key={tipo} className="p-3">
            <div className="text-[10px] text-muted-foreground leading-tight mb-1">{tipo}</div>
            {isFinanceiro(tipo) ? (
              <>
                <div className="text-sm font-bold">{summary[tipo].count}x</div>
                <div className="text-[10px] text-muted-foreground">{formatBRL(summary[tipo].total)}</div>
              </>
            ) : (
              <div className="text-2xl font-bold">{summary[tipo].count}</div>
            )}
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs">Funcionário</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Horas / Valor</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs">Arquivo</TableHead>
                  <TableHead className="text-xs w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                )}
                {!loading && paginatedData.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">Nenhuma ocorrência encontrada.</TableCell></TableRow>
                )}
                {paginatedData.map((o) => (
                  <TableRow key={o.id} className="text-xs">
                    <TableCell>{formatDate(o.data)}</TableCell>
                    <TableCell>{o.pessoal_funcionarios?.nome ?? funcName(o.funcionario_id)}</TableCell>
                    <TableCell>
                      <Badge className={`${TIPO_COLORS[o.tipo]} hover:${TIPO_COLORS[o.tipo]} text-white text-[10px] whitespace-nowrap`}>{o.tipo}</Badge>
                    </TableCell>
                    <TableCell>
                      {o.horas != null && <span>{o.horas}h</span>}
                      {o.valor != null && <span className={(o.tipo === 'Bonificação' || o.tipo === 'Quebra de Caixa (Crédito)') ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{formatBRL(o.valor)}</span>}
                      {o.horas == null && o.valor == null && '—'}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <ObsTooltip text={o.descricao} maxWidth="max-w-[200px]" />
                    </TableCell>
                    <TableCell>
                      {o.arquivo_path ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => getFileUrl(o.arquivo_path!)} title="Ver arquivo">
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteTarget(o)}>
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
            itemLabel="ocorrências"
          />
        </CardContent>
      </Card>

      {/* ── Dialog ─────────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar Ocorrência' : 'Nova Ocorrência'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Funcionário(s) *</Label>
              {editTarget ? (
                <Select value={form.funcionario_id} onValueChange={(v) => setForm((f) => ({ ...f, funcionario_id: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {funcionarios.filter((f) => f.status === 'ativo').map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <div className="flex gap-2 mb-1">
                    <Button
                      type="button" variant="outline" size="sm" className="h-6 text-xs px-2"
                      onClick={() => setSelectedFuncs(new Set(funcionarios.filter((f) => f.status === 'ativo').map((f) => f.id)))}
                    >
                      Selecionar Todos
                    </Button>
                    <Button
                      type="button" variant="outline" size="sm" className="h-6 text-xs px-2"
                      onClick={() => setSelectedFuncs(new Set())}
                    >
                      Limpar Seleção
                    </Button>
                  </div>
                  <div className="border rounded-md max-h-[150px] overflow-y-auto p-2 space-y-1.5">
                    {funcionarios.filter((f) => f.status === 'ativo').map((f) => (
                      <div key={f.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`func-${f.id}`}
                          checked={selectedFuncs.has(f.id)}
                          onCheckedChange={(checked) => {
                            setSelectedFuncs((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(f.id); else next.delete(f.id);
                              return next;
                            });
                          }}
                        />
                        <label htmlFor={`func-${f.id}`} className="text-xs cursor-pointer select-none">{f.nome}</label>
                      </div>
                    ))}
                    {funcionarios.filter((f) => f.status === 'ativo').length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum funcionário ativo.</p>
                    )}
                  </div>
                  {selectedFuncs.size > 0 && (
                    <p className="text-xs text-muted-foreground">{selectedFuncs.size} selecionado{selectedFuncs.size > 1 ? 's' : ''}</p>
                  )}
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data *</Label>
                <Input type="date" className="h-8 text-xs" value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v as OcorrenciaTipo, horas: '', valor: '' }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Horas — only for Atraso / Hora Extra */}
            {(form.tipo === 'Atraso' || form.tipo === 'Hora Extra') && (
              <div className="space-y-1">
                <Label className="text-xs">Horas</Label>
                <Input type="number" step="0.5" min="0" className="h-8 text-xs" placeholder="ex: 1.5" value={form.horas} onChange={(e) => setForm((f) => ({ ...f, horas: e.target.value }))} />
              </div>
            )}

            {/* Valor — only for financial types */}
            {isFinanceiro(form.tipo) && (
              <div className="space-y-1">
                <Label className="text-xs">
                  Valor (R$) *
                  {form.tipo === 'Bonificação' && <span className="ml-1 text-green-600">(vai para Premiação)</span>}
                  {form.tipo === 'Quebra de Caixa (Crédito)' && <span className="ml-1 text-teal-600">(crédito — vai para Quebra de Caixa)</span>}
                  {(form.tipo === 'Vale Funcionário' || form.tipo === 'Desconto Quebra de Caixa' || form.tipo === 'Dano/Prejuízo') && (
                    <span className="ml-1 text-red-600">(vai para Descontos)</span>
                  )}
                </Label>
                <Input
                  type="number" step="0.01" min="0"
                  className="h-8 text-xs"
                  placeholder="0,00"
                  value={form.valor}
                  onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Descrição / Observação</Label>
              <Textarea className="text-xs min-h-[60px]" value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
            </div>
            {(!editTarget && selectedFuncs.size > 1) ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Arquivo (não disponível para múltiplos funcionários)</Label>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Arquivo (opcional)</Label>
                <Input ref={fileRef} type="file" className="h-8 text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {editTarget?.arquivo_path && !file && (
                  <div className="text-xs text-muted-foreground">Arquivo existente será mantido.</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir ocorrência?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
