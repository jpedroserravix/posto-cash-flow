import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Save, X, FilterX, Check, Landmark, Paperclip, FileText, ExternalLink } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { openInNewTab } from '@/lib/utils';
import { FilterableHead } from '@/components/FilterableHead';
import { HorizontalScrollSync } from '@/components/HorizontalScrollSync';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { useDateFilter } from '@/hooks/useDateFilter';
import { DateFilter } from '@/components/DateFilter';

const TURNOS = ['TURNO 1', 'TURNO 2', 'TURNO 3'];
const CENTROS_CUSTO = ['PISTA', 'CONVENIÊNCIA', 'TROCA DE ÓLEO'];

type SortDir = 'asc' | 'desc' | null;

interface ManualDeposit {
  id: string;
  data: string;
  turno: string;
  centro_custo: string | null;
  valor_lancado: number;
  valor_depositado: number | null;
  observacao: string | null;
  conferido: string;
  conciliado_banco_id: string | null;
  comprovante_path: string | null;
  comprovante_type: string | null;
}

interface PreviewFile {
  url: string;
  type: 'image' | 'pdf';
}

interface ContaBancaria {
  id: string;
  banco: string;
  agencia: string;
  conta: string;
}

export default function DepositosManuais() {
  const { selectedPostoId, role } = useAuth();
  const isMobile = useIsMobile();
  const { preset: dfPreset, range: dfRange, setPreset: setDfPreset } = useDateFilter();
  const [deposits, setDeposits] = useState<ManualDeposit[]>([]);
  const [allDeposits, setAllDeposits] = useState<ManualDeposit[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ data: '', turno: '', centro_custo: '', valor_lancado: '', valor_depositado: '', observacao: '' });
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [concSelected, setConcSelected] = useState<Set<string>>(new Set());
  const [concContaId, setConcContaId] = useState('');
  const [bulkCentroCusto, setBulkCentroCusto] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [deletingComprovanteId, setDeletingComprovanteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sort
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Filters (Set = excluded values)
  const [filterData, setFilterData] = useState<Set<string>>(new Set());
  const [filterTurno, setFilterTurno] = useState<Set<string>>(new Set());
  const [filterCentroCusto, setFilterCentroCusto] = useState<Set<string>>(new Set());
  const [filterObservacao, setFilterObservacao] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedPostoId) {
      loadAllDeposits();
      loadContas();
    }
  }, [selectedPostoId]);

  useEffect(() => {
    if (selectedPostoId) {
      loadDeposits();
    }
  }, [selectedPostoId, dfRange.start, dfRange.end]);

  const loadAllDeposits = async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('depositos_manuais')
      .select('*')
      .eq('posto_id', selectedPostoId)
      .order('data', { ascending: true })
      .order('created_at', { ascending: true });
    setAllDeposits(data || []);
  };

  const loadDeposits = async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('depositos_manuais')
      .select('*')
      .eq('posto_id', selectedPostoId)
      .gte('data', dfRange.start)
      .lte('data', dfRange.end)
      .order('data', { ascending: true })
      .order('created_at', { ascending: true });
    setDeposits(data || []);
  };

  const loadContas = async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('contas_bancarias')
      .select('*')
      .eq('posto_id', selectedPostoId);
    setContas(data || []);
  };

  const getStorageUrl = (path: string) =>
    supabase.storage.from('despesas-comprovantes').getPublicUrl(path).data.publicUrl;

  const parseMoney = (v: string) => {
    if (!v.trim()) return null;
    const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');

  // Unique values for filters
  const uniqueData = useMemo(() => [...new Set(deposits.map(d => formatDate(d.data)))].sort(), [deposits]);
  const uniqueTurno = useMemo(() => [...new Set(deposits.map(d => d.turno))].sort(), [deposits]);
  const uniqueCentroCusto = useMemo(() => [...new Set(deposits.map(d => d.centro_custo || ''))].sort(), [deposits]);
  const uniqueObservacao = useMemo(() => [...new Set(deposits.map(d => d.observacao || ''))].sort(), [deposits]);
  const uniqueStatus = useMemo(() => {
    const statuses = new Set<string>();
    deposits.forEach(d => {
      statuses.add(d.conciliado_banco_id ? 'Recebido' : '');
    });
    return [...statuses].sort();
  }, [deposits]);

  const toggleSort = (col: string) => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortCol(null); setSortDir(null); }
  };

  const activeFilterCount = filterData.size + filterTurno.size + filterCentroCusto.size + filterObservacao.size + filterStatus.size;

  const clearAllFilters = () => {
    setFilterData(new Set());
    setFilterTurno(new Set());
    setFilterCentroCusto(new Set());
    setFilterObservacao(new Set());
    setFilterStatus(new Set());
  };

  const getStatus = (d: ManualDeposit) =>
    d.conciliado_banco_id ? 'Recebido' : '';

  // Filtered + sorted data
  const filteredData = useMemo(() => {
    let result = [...deposits];

    if (filterData.size > 0) result = result.filter(d => !filterData.has(formatDate(d.data)));
    if (filterTurno.size > 0) result = result.filter(d => !filterTurno.has(d.turno));
    if (filterCentroCusto.size > 0) result = result.filter(d => !filterCentroCusto.has(d.centro_custo || ''));
    if (filterObservacao.size > 0) result = result.filter(d => !filterObservacao.has(d.observacao || ''));
    if (filterStatus.size > 0) result = result.filter(d => !filterStatus.has(getStatus(d)));

    if (sortCol && sortDir) {
      result.sort((a, b) => {
        let va: any, vb: any;
        switch (sortCol) {
          case 'data': va = a.data; vb = b.data; break;
          case 'turno': va = a.turno; vb = b.turno; break;
          case 'centro_custo': va = a.centro_custo || ''; vb = b.centro_custo || ''; break;
          case 'valor_lancado': va = a.valor_lancado; vb = b.valor_lancado; break;
          case 'valor_depositado': va = a.valor_depositado || 0; vb = b.valor_depositado || 0; break;
          case 'observacao': va = a.observacao || ''; vb = b.observacao || ''; break;
          case 'status': va = getStatus(a); vb = getStatus(b); break;
          default: return 0;
        }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [deposits, filterData, filterTurno, filterCentroCusto, filterObservacao, filterStatus, sortCol, sortDir]);

  // Historical cumulative balance map — computed from ALL deposits regardless of date filter
  const historicalSaldoMap = useMemo(() => {
    let acc = 0;
    const map: Record<string, number> = {};
    for (const d of allDeposits) {
      acc += d.valor_lancado - (d.valor_depositado || 0);
      map[d.id] = acc;
    }
    return map;
  }, [allDeposits]);

  const depositsWithSaldo = filteredData.map(d => ({
    ...d,
    saldo: historicalSaldoMap[d.id] ?? 0,
  }));

  const pagination = usePagination(depositsWithSaldo, [filterData, filterTurno, filterCentroCusto, filterObservacao, filterStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPostoId) return;

    const valorLancado = parseMoney(formData.valor_lancado);
    if (valorLancado === null) { toast.error('Informe o valor lançado'); return; }

    let comprovante_path: string | null = null;
    let comprovante_type: string | null = null;

    if (formFile) {
      const fileType = formFile.type.startsWith('image/') ? 'image' : 'pdf';
      const safeName = formFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${selectedPostoId}/${formData.data}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('despesas-comprovantes')
        .upload(path, formFile, { upsert: false, contentType: formFile.type });
      if (uploadError) { toast.error('Erro ao enviar arquivo: ' + uploadError.message); return; }
      comprovante_path = path;
      comprovante_type = fileType;
    }

    const record = {
      posto_id: selectedPostoId,
      data: formData.data,
      turno: formData.turno,
      centro_custo: formData.centro_custo || null,
      valor_lancado: valorLancado,
      valor_depositado: parseMoney(formData.valor_depositado),
      observacao: formData.observacao || null,
      ...(comprovante_path ? { comprovante_path, comprovante_type } : {}),
    };

    if (editingId) {
      const { error } = await supabase.from('depositos_manuais').update(record).eq('id', editingId);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Atualizado');
      setEditingId(null);
    } else {
      const { error } = await supabase.from('depositos_manuais').insert(record);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Lançamento adicionado');
    }

    setFormData({ data: '', turno: '', centro_custo: '', valor_lancado: '', valor_depositado: '', observacao: '' });
    setFormFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowForm(false);
    loadDeposits();
    loadAllDeposits();
  };

  const handleDeleteComprovante = async (d: ManualDeposit) => {
    if (!d.comprovante_path) return;
    const { error: storageError } = await supabase.storage
      .from('despesas-comprovantes')
      .remove([d.comprovante_path]);
    if (storageError) { toast.error('Erro ao remover arquivo: ' + storageError.message); return; }
    const { error } = await supabase.from('depositos_manuais')
      .update({ comprovante_path: null, comprovante_type: null })
      .eq('id', d.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Comprovante removido');
    setDeletingComprovanteId(null);
    loadDeposits();
    loadAllDeposits();
  };

  const handleEdit = (d: ManualDeposit) => {
    setEditingId(d.id);
    setFormData({
      data: d.data,
      turno: d.turno,
      centro_custo: d.centro_custo || '',
      valor_lancado: d.valor_lancado.toString(),
      valor_depositado: d.valor_depositado?.toString() || '',
      observacao: d.observacao || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return;
    const { error } = await supabase.from('depositos_manuais').delete().eq('id', id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Excluído'); loadDeposits(); loadAllDeposits(); }
  };

  const handleToggleConferido = async (d: ManualDeposit) => {
    const newStatus = d.conferido === 'OK' ? 'PENDENTE' : 'OK';
    const { error } = await supabase.from('depositos_manuais').update({ conferido: newStatus }).eq('id', d.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(newStatus === 'OK' ? 'Marcado como conferido' : 'Marcado como pendente');
    loadDeposits();
    loadAllDeposits();
  };

  const toggleConcSelect = (id: string) => {
    const next = new Set(concSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setConcSelected(next);
  };

  const handleConciliar = async () => {
    if (concSelected.size === 0 || !concContaId) {
      toast.error('Selecione depósitos e uma conta bancária');
      return;
    }
    const ids = [...concSelected];
    const { error } = await supabase
      .from('depositos_manuais')
      .update({ conciliado_banco_id: concContaId, conferido: 'OK' })
      .in('id', ids);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`${ids.length} depósito(s) conciliado(s)`);
    setConcSelected(new Set());
    setConcContaId('');
    loadDeposits();
    loadAllDeposits();
  };

  const handleDesconciliar = async (id: string) => {
    const { error } = await supabase.from('depositos_manuais').update({ conciliado_banco_id: null }).eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Conciliação removida');
    loadDeposits();
    loadAllDeposits();
  };

  const handleBulkCentroCusto = async () => {
    if (concSelected.size === 0 || !bulkCentroCusto) {
      toast.error('Selecione depósitos e um centro de custo');
      return;
    }
    const ids = [...concSelected];
    const { error } = await supabase
      .from('depositos_manuais')
      .update({ centro_custo: bulkCentroCusto })
      .in('id', ids);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(`Centro de custo aplicado em ${ids.length} depósito(s)`);
    setBulkCentroCusto('');
    loadDeposits();
    loadAllDeposits();
  };

  const contaLabel = (c: ContaBancaria) => `${c.banco} - Ag ${c.agencia} / Cc ${c.conta}`;

  const getContaName = (id: string | null) => {
    if (!id) return null;
    const c = contas.find(c => c.id === id);
    return c ? contaLabel(c) : null;
  };

  if (!selectedPostoId) {
    return <p className="text-muted-foreground text-center py-8">Selecione um posto para continuar.</p>;
  }

  const pendingNonConciliados = filteredData.filter(d => !d.conciliado_banco_id);
  const hasPendingSelected = concSelected.size > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">Depósitos Manuais</h1>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={clearAllFilters}>
              <FilterX className="w-3 h-3 mr-1" />Limpar filtros ({activeFilterCount})
            </Button>
          )}
        </div>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ data: '', turno: '', centro_custo: '', valor_lancado: '', valor_depositado: '', observacao: '' }); }}>
          {showForm ? <><X className="w-4 h-4 mr-1" />Cancelar</> : <><Plus className="w-4 h-4 mr-1" />Novo Lançamento</>}
        </Button>
      </div>

      <DateFilter preset={dfPreset} range={dfRange} onChange={setDfPreset} />

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Data</label>
                <Input type="date" value={formData.data} onChange={e => setFormData({ ...formData, data: e.target.value })} required className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Turno</label>
                <Select value={formData.turno} onValueChange={v => setFormData({ ...formData, turno: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Turno" /></SelectTrigger>
                  <SelectContent>{TURNOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Centro de Custo</label>
                <Select value={formData.centro_custo || '__empty__'} onValueChange={v => setFormData({ ...formData, centro_custo: v === '__empty__' ? '' : v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__empty__">(Em branco)</SelectItem>
                    {CENTROS_CUSTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Valor Avulso Caixa (R$)</label>
                <Input value={formData.valor_lancado} onChange={e => setFormData({ ...formData, valor_lancado: e.target.value })} placeholder="0,00" required className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Valor Depositado (R$)</label>
                <Input value={formData.valor_depositado} onChange={e => setFormData({ ...formData, valor_depositado: e.target.value })} placeholder="0,00" className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Observação</label>
                <Input value={formData.observacao} onChange={e => setFormData({ ...formData, observacao: e.target.value })} placeholder="Ex: SICREDI/JP" className="h-9" />
              </div>
              <div className="sm:col-span-2 lg:col-span-5">
                <label className="text-xs font-medium mb-1 block">Comprovante <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && setFormFile(e.target.files[0])}
                />
                {formFile ? (
                  <div className="flex items-center gap-2 h-9 rounded-md border px-3 text-xs">
                    <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1">{formFile.name}</span>
                    <button type="button" onClick={() => { setFormFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                      <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip className="w-3.5 h-3.5" />
                    Anexar arquivo
                  </Button>
                )}
              </div>
              <div className="flex items-end">
                <Button type="submit" size="sm" className="h-9 px-4 w-full">
                  <Save className="w-4 h-4 mr-1" />Salvar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Conciliação bar */}
      {role === 'admin' && hasPendingSelected && (() => {
        const selectedDeposits = deposits.filter(d => concSelected.has(d.id));
        const somaLancado = selectedDeposits.reduce((acc, d) => acc + d.valor_lancado, 0);
        const somaDepositado = selectedDeposits.reduce((acc, d) => acc + (d.valor_depositado || 0), 0);
        return (
          <Card>
            <CardContent className="pt-4 flex flex-wrap items-center gap-3">
              <Landmark className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{concSelected.size} selecionado(s)</span>
              <Badge variant="secondary" className="text-xs">Avulso Caixa: {formatCurrency(somaLancado)}</Badge>
              <Badge variant="secondary" className="text-xs">Depositado: {formatCurrency(somaDepositado)}</Badge>
              {contas.length > 0 && (
                <>
                  <Select value={concContaId} onValueChange={setConcContaId}>
                    <SelectTrigger className="h-8 w-64 text-xs"><SelectValue placeholder="Conta bancária" /></SelectTrigger>
                    <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{contaLabel(c)}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" className="h-8" onClick={handleConciliar} disabled={!concContaId}>
                    <Check className="w-3 h-3 mr-1" />Conciliar Valor Depositado
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setConcSelected(new Set())}>
                Cancelar
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Select value={bulkCentroCusto || '__empty__'} onValueChange={v => setBulkCentroCusto(v === '__empty__' ? '' : v)}>
                <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Centro de Custo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">(Em branco)</SelectItem>
                  {CENTROS_CUSTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" onClick={handleBulkCentroCusto} disabled={!bulkCentroCusto}>
                Aplicar Centro de Custo
              </Button>
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardContent className="pt-4">
          {depositsWithSaldo.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">Nenhum lançamento manual ainda.</p>
          ) : (
            <>
              <HorizontalScrollSync>
                <Table>
                  <TableHeader>
                    <tr>
                      {role === 'admin' && <th className="w-8" />}
                      <FilterableHead label="Status" sortActive={sortCol === 'status'} sortDir={sortCol === 'status' ? sortDir : null} onSort={() => toggleSort('status')} uniqueValues={uniqueStatus} selectedValues={filterStatus} onFilterChange={setFilterStatus} />
                      <FilterableHead label="Data" sortActive={sortCol === 'data'} sortDir={sortCol === 'data' ? sortDir : null} onSort={() => toggleSort('data')} uniqueValues={uniqueData} selectedValues={filterData} onFilterChange={setFilterData} />
                      <FilterableHead label="Turno" sortActive={sortCol === 'turno'} sortDir={sortCol === 'turno' ? sortDir : null} onSort={() => toggleSort('turno')} uniqueValues={uniqueTurno} selectedValues={filterTurno} onFilterChange={setFilterTurno} />
                      <FilterableHead label="Centro de Custo" sortActive={sortCol === 'centro_custo'} sortDir={sortCol === 'centro_custo' ? sortDir : null} onSort={() => toggleSort('centro_custo')} uniqueValues={uniqueCentroCusto} selectedValues={filterCentroCusto} onFilterChange={setFilterCentroCusto} />
                      <FilterableHead label="Valor Avulso Caixa" sortActive={sortCol === 'valor_lancado'} sortDir={sortCol === 'valor_lancado' ? sortDir : null} onSort={() => toggleSort('valor_lancado')} uniqueValues={[]} selectedValues={new Set()} onFilterChange={() => {}} className="text-right" />
                      <FilterableHead label="Valor Depositado" sortActive={sortCol === 'valor_depositado'} sortDir={sortCol === 'valor_depositado' ? sortDir : null} onSort={() => toggleSort('valor_depositado')} uniqueValues={[]} selectedValues={new Set()} onFilterChange={() => {}} className="text-right" />
                      <FilterableHead label="Saldo Pendente Histórico" sortActive={false} sortDir={null} onSort={() => {}} uniqueValues={[]} selectedValues={new Set()} onFilterChange={() => {}} className="text-right" />
                      <FilterableHead label="Observação" sortActive={sortCol === 'observacao'} sortDir={sortCol === 'observacao' ? sortDir : null} onSort={() => toggleSort('observacao')} uniqueValues={uniqueObservacao} selectedValues={filterObservacao} onFilterChange={setFilterObservacao} />
                      <FilterableHead label="" sortActive={false} sortDir={null} onSort={() => {}} uniqueValues={[]} selectedValues={new Set()} onFilterChange={() => {}} />
                    </tr>
                  </TableHeader>
                  <TableBody>
                    {pagination.paginatedData.map(d => {
                      const isConciliado = !!d.conciliado_banco_id;
                      const isConferido = d.conferido === 'OK';
                      const isSelected = concSelected.has(d.id);
                      return (
                        <TableRow key={d.id} className={cn(
                          isConciliado && 'bg-green-50 dark:bg-green-950/20',
                          isSelected && !isConciliado && 'bg-accent/50'
                        )}>
                          {role === 'admin' && (
                            <TableCell className="w-8">
                              {!isConciliado && (
                                <Checkbox checked={isSelected} onCheckedChange={() => toggleConcSelect(d.id)} />
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            {isConciliado ? (
                              <div className="space-y-0.5">
                                <Badge variant="default" className="text-[10px] bg-green-600 hover:bg-green-700 cursor-pointer" onClick={() => role === 'admin' && handleDesconciliar(d.id)}>
                                  Recebido
                                </Badge>
                                <p className="text-[9px] text-muted-foreground truncate max-w-[120px]">{getContaName(d.conciliado_banco_id)}</p>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(d.data)}</TableCell>
                          <TableCell className="text-xs">{d.turno}</TableCell>
                          <TableCell className="text-xs">{d.centro_custo || '—'}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{formatCurrency(d.valor_lancado)}</TableCell>
                          <TableCell className="text-right text-xs">{d.valor_depositado ? formatCurrency(d.valor_depositado) : '—'}</TableCell>
                          <TableCell className={`text-right text-xs font-bold ${
                            d.saldo === 0 ? 'text-success' : d.saldo > 0 ? 'text-warning' : 'text-destructive'
                          }`}>
                            {formatCurrency(d.saldo)}
                          </TableCell>
                          <TableCell className="text-xs">{d.observacao || ''}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 items-center">
                              {d.comprovante_path && (
                                <HoverCard openDelay={200}>
                                  <HoverCardTrigger asChild>
                                    <div className="relative group/comp inline-flex">
                                      <button
                                        className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-muted"
                                        onClick={() => {
                                          const url = getStorageUrl(d.comprovante_path!);
                                          const type = d.comprovante_type === 'image' ? 'image' : 'pdf';
                                          if (type === 'pdf' && isMobile) { openInNewTab(url); return; }
                                          setPreviewFile({ url, type });
                                        }}
                                      >
                                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                                      </button>
                                      <button
                                        type="button"
                                        className="absolute -top-1 -right-1 hidden group-hover/comp:flex h-4 w-4 items-center justify-center rounded-full bg-destructive"
                                        onClick={(e) => { e.stopPropagation(); setDeletingComprovanteId(d.id); }}
                                      >
                                        <X className="h-2.5 w-2.5 text-white" />
                                      </button>
                                    </div>
                                  </HoverCardTrigger>
                                  <HoverCardContent side="left" className="w-48 p-1">
                                    {d.comprovante_type === 'image' ? (
                                      <img src={getStorageUrl(d.comprovante_path)} className="w-full rounded object-cover" alt="" />
                                    ) : (
                                      <iframe src={getStorageUrl(d.comprovante_path)} className="w-full h-36 rounded" title="preview" />
                                    )}
                                  </HoverCardContent>
                                </HoverCard>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => handleEdit(d)}><Pencil className="w-3 h-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(d.id)}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </HorizontalScrollSync>
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
            </>
          )}
        </CardContent>
      </Card>
      {/* Preview modal */}
      <Dialog open={!!previewFile} onOpenChange={() => setPreviewFile(null)}>
        <DialogContent className="max-w-3xl p-2">
          {previewFile?.type === 'image' ? (
            <img src={previewFile.url} className="w-full rounded" alt="" />
          ) : isMobile ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12 bg-muted/30 rounded">
              <FileText className="w-14 h-14 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center px-4">
                Pré-visualização de PDF não disponível no celular.
              </p>
              <a href={previewFile?.url} target="_blank" rel="noreferrer">
                <Button className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Abrir PDF
                </Button>
              </a>
            </div>
          ) : (
            <iframe src={previewFile?.url} className="w-full h-[70vh] rounded" title="Comprovante" />
          )}
          <div className="flex justify-end pt-1">
            <a href={previewFile?.url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="text-xs">Abrir em nova aba</Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete comprovante alert */}
      <AlertDialog open={!!deletingComprovanteId} onOpenChange={() => setDeletingComprovanteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover comprovante?</AlertDialogTitle>
            <AlertDialogDescription>O arquivo será excluído permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                const d = deposits.find(dep => dep.id === deletingComprovanteId);
                if (d) handleDeleteComprovante(d);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
