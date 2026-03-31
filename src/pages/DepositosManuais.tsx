import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Save, X, FilterX } from 'lucide-react';
import { FilterableHead } from '@/components/FilterableHead';

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
}

export default function DepositosManuais() {
  const { selectedPostoId } = useAuth();
  const [deposits, setDeposits] = useState<ManualDeposit[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ data: '', turno: '', centro_custo: '', valor_lancado: '', valor_depositado: '', observacao: '' });

  // Sort
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Filters (Set = excluded values)
  const [filterData, setFilterData] = useState<Set<string>>(new Set());
  const [filterTurno, setFilterTurno] = useState<Set<string>>(new Set());
  const [filterCentroCusto, setFilterCentroCusto] = useState<Set<string>>(new Set());
  const [filterObservacao, setFilterObservacao] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (selectedPostoId) loadDeposits();
  }, [selectedPostoId]);

  const loadDeposits = async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('depositos_manuais')
      .select('*')
      .eq('posto_id', selectedPostoId)
      .order('data', { ascending: true })
      .order('created_at', { ascending: true });
    setDeposits(data || []);
  };

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

  const toggleSort = (col: string) => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortCol(null); setSortDir(null); }
  };

  const activeFilterCount = filterData.size + filterTurno.size + filterCentroCusto.size + filterObservacao.size;

  const clearAllFilters = () => {
    setFilterData(new Set());
    setFilterTurno(new Set());
    setFilterCentroCusto(new Set());
    setFilterObservacao(new Set());
  };

  // Filtered + sorted data
  const filteredData = useMemo(() => {
    let result = [...deposits];

    if (filterData.size > 0) result = result.filter(d => !filterData.has(formatDate(d.data)));
    if (filterTurno.size > 0) result = result.filter(d => !filterTurno.has(d.turno));
    if (filterCentroCusto.size > 0) result = result.filter(d => !filterCentroCusto.has(d.centro_custo || ''));
    if (filterObservacao.size > 0) result = result.filter(d => !filterObservacao.has(d.observacao || ''));

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
          default: return 0;
        }
        if (va < vb) return sortDir === 'asc' ? -1 : 1;
        if (va > vb) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [deposits, filterData, filterTurno, filterCentroCusto, filterObservacao, sortCol, sortDir]);

  // Running balance on filtered data
  let saldoAcumulado = 0;
  const depositsWithSaldo = filteredData.map(d => {
    saldoAcumulado += d.valor_lancado - (d.valor_depositado || 0);
    return { ...d, saldo: saldoAcumulado };
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPostoId) return;

    const valorLancado = parseMoney(formData.valor_lancado);
    if (valorLancado === null) { toast.error('Informe o valor lançado'); return; }

    const record = {
      posto_id: selectedPostoId,
      data: formData.data,
      turno: formData.turno,
      centro_custo: formData.centro_custo || null,
      valor_lancado: valorLancado,
      valor_depositado: parseMoney(formData.valor_depositado),
      observacao: formData.observacao || null,
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
    setShowForm(false);
    loadDeposits();
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
    else { toast.success('Excluído'); loadDeposits(); }
  };

  if (!selectedPostoId) {
    return <p className="text-muted-foreground text-center py-8">Selecione um posto para continuar.</p>;
  }

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
                <Select value={formData.centro_custo} onValueChange={v => setFormData({ ...formData, centro_custo: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>{CENTROS_CUSTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Valor Lançado (R$)</label>
                <Input value={formData.valor_lancado} onChange={e => setFormData({ ...formData, valor_lancado: e.target.value })} placeholder="0,00" required className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Valor Depositado (R$)</label>
                <Input value={formData.valor_depositado} onChange={e => setFormData({ ...formData, valor_depositado: e.target.value })} placeholder="0,00" className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Observação</label>
                <div className="flex gap-2">
                  <Input value={formData.observacao} onChange={e => setFormData({ ...formData, observacao: e.target.value })} placeholder="Ex: SICREDI/JP" className="h-9" />
                  <Button type="submit" size="sm" className="h-9 px-3">
                    <Save className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          {depositsWithSaldo.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">Nenhum lançamento manual ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <FilterableHead label="Data" sortActive={sortCol === 'data'} sortDir={sortCol === 'data' ? sortDir : null} onSort={() => toggleSort('data')} uniqueValues={uniqueData} selectedValues={filterData} onFilterChange={setFilterData} />
                  <FilterableHead label="Turno" sortActive={sortCol === 'turno'} sortDir={sortCol === 'turno' ? sortDir : null} onSort={() => toggleSort('turno')} uniqueValues={uniqueTurno} selectedValues={filterTurno} onFilterChange={setFilterTurno} />
                  <FilterableHead label="Centro de Custo" sortActive={sortCol === 'centro_custo'} sortDir={sortCol === 'centro_custo' ? sortDir : null} onSort={() => toggleSort('centro_custo')} uniqueValues={uniqueCentroCusto} selectedValues={filterCentroCusto} onFilterChange={setFilterCentroCusto} />
                  <FilterableHead label="Valor Lançado" sortActive={sortCol === 'valor_lancado'} sortDir={sortCol === 'valor_lancado' ? sortDir : null} onSort={() => toggleSort('valor_lancado')} uniqueValues={[]} selectedValues={new Set()} onFilterChange={() => {}} className="text-right" />
                  <FilterableHead label="Valor Depositado" sortActive={sortCol === 'valor_depositado'} sortDir={sortCol === 'valor_depositado' ? sortDir : null} onSort={() => toggleSort('valor_depositado')} uniqueValues={[]} selectedValues={new Set()} onFilterChange={() => {}} className="text-right" />
                  <FilterableHead label="Saldo Pendente" sortActive={false} sortDir={null} onSort={() => {}} uniqueValues={[]} selectedValues={new Set()} onFilterChange={() => {}} className="text-right" />
                  <FilterableHead label="Observação" sortActive={sortCol === 'observacao'} sortDir={sortCol === 'observacao' ? sortDir : null} onSort={() => toggleSort('observacao')} uniqueValues={uniqueObservacao} selectedValues={filterObservacao} onFilterChange={setFilterObservacao} />
                  <FilterableHead label="" sortActive={false} sortDir={null} onSort={() => {}} uniqueValues={[]} selectedValues={new Set()} onFilterChange={() => {}} />
                </tr>
              </TableHeader>
              <TableBody>
                {depositsWithSaldo.map(d => (
                  <TableRow key={d.id}>
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
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(d)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(d.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
