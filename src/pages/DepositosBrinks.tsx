import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, Save, Search, CheckCircle, ArrowUp, ArrowDown, ArrowUpDown, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

type SortDir = 'asc' | 'desc' | null;

function SortableHead({ label, active, dir, onClick, className }: { label: string; active: boolean; dir: SortDir; onClick: () => void; className?: string }) {
  return (
    <TableHead className={cn("cursor-pointer select-none hover:bg-muted/50", className)} onClick={onClick}>
      <span className="inline-flex items-center gap-1">
        {label}
        {!active && <ArrowUpDown className="w-3 h-3 text-muted-foreground" />}
        {active && dir === 'asc' && <ArrowUp className="w-3 h-3" />}
        {active && dir === 'desc' && <ArrowDown className="w-3 h-3" />}
      </span>
    </TableHead>
  );
}

interface BrinksRow {
  id?: string;
  data_deposito: string;
  moeda: string;
  valor: number;
  tipo: string;
  depositante: string;
  data_caixa: string;
  turno: string;
  observacao: string;
}

interface DepositoCompleto {
  id: string;
  data_deposito: string;
  moeda: string;
  valor: number;
  tipo: string;
  depositante: string;
  data_caixa: string;
  turno: string;
  observacao: string;
  conciliado_banco_id: string | null;
}

const TURNOS = ['TURNO 1', 'TURNO 2', 'TURNO 3'];

function parseCSV(text: string): BrinksRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  const header = lines[0].split(/[;,\t]/).map(h => h.trim().replace(/"/g, '').toUpperCase());
  
  const dataIdx = header.findIndex(h => h.includes('DATA') && h.includes('DEP'));
  const moedaIdx = header.findIndex(h => h.includes('MOEDA'));
  const valorIdx = header.findIndex(h => h.includes('VALOR'));
  const tipoIdx = header.findIndex(h => h.includes('TIPO'));
  const depositanteIdx = header.findIndex(h => h.includes('DEPOSITANTE'));

  if (dataIdx === -1 || valorIdx === -1) {
    toast.error('Arquivo não contém as colunas esperadas');
    return [];
  }

  const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';

  return lines.slice(1).filter(l => l.trim()).map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/"/g, ''));
    const dataStr = cols[dataIdx] || '';
    const valorStr = (cols[valorIdx] || '0').replace(/\./g, '').replace(',', '.');
    
    return {
      data_deposito: dataStr,
      moeda: cols[moedaIdx] || '',
      valor: parseFloat(valorStr) || 0,
      tipo: cols[tipoIdx] || '',
      depositante: cols[depositanteIdx] || '',
      data_caixa: dataStr.split(' ')[0] || dataStr.substring(0, 10),
      turno: '',
      observacao: '',
    };
  });
}

function parseHTML(text: string): BrinksRow[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const tables = doc.querySelectorAll('table');
  if (tables.length === 0) return [];

  const table = tables[tables.length - 1];
  const rows = table.querySelectorAll('tr');
  if (rows.length < 2) return [];

  const headers = Array.from(rows[0].querySelectorAll('th, td')).map(td => td.textContent?.trim().toUpperCase() || '');
  
  const dataIdx = headers.findIndex(h => h.includes('DATA') && h.includes('DEP'));
  const moedaIdx = headers.findIndex(h => h.includes('MOEDA'));
  const valorIdx = headers.findIndex(h => h.includes('VALOR'));
  const tipoIdx = headers.findIndex(h => h.includes('TIPO'));
  const depositanteIdx = headers.findIndex(h => h.includes('DEPOSITANTE'));

  if (dataIdx === -1 || valorIdx === -1) {
    toast.error('Tabela HTML não contém as colunas esperadas');
    return [];
  }

  const result: BrinksRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = Array.from(rows[i].querySelectorAll('td')).map(td => td.textContent?.trim() || '');
    if (cells.length < 2) continue;
    const dataStr = cells[dataIdx] || '';
    const valorStr = (cells[valorIdx] || '0').replace(/\./g, '').replace(',', '.');

    result.push({
      data_deposito: dataStr,
      moeda: cells[moedaIdx] || '',
      valor: parseFloat(valorStr) || 0,
      tipo: cells[tipoIdx] || '',
      depositante: cells[depositanteIdx] || '',
      data_caixa: dataStr.split(' ')[0] || dataStr.substring(0, 10),
      turno: '',
      observacao: '',
    });
  }
  return result;
}

function parseXLSX(data: ArrayBuffer): BrinksRow[] {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false });
  if (jsonData.length < 2) return [];

  const headers = (jsonData[0] as string[]).map(h => (h || '').toString().trim().toUpperCase());
  const dataIdx = headers.findIndex(h => h.includes('DATA') && h.includes('DEP'));
  const moedaIdx = headers.findIndex(h => h.includes('MOEDA'));
  const valorIdx = headers.findIndex(h => h.includes('VALOR'));
  const tipoIdx = headers.findIndex(h => h.includes('TIPO'));
  const depositanteIdx = headers.findIndex(h => h.includes('DEPOSITANTE'));

  if (dataIdx === -1 || valorIdx === -1) {
    toast.error('Planilha não contém as colunas esperadas (DATA DEP... e VALOR)');
    return [];
  }

  return jsonData.slice(1).filter(row => row && row.length > 1).map(row => {
    const cols = (row as string[]).map(c => (c || '').toString().trim());
    const dataStr = cols[dataIdx] || '';
    const valorStr = (cols[valorIdx] || '0').replace(/\./g, '').replace(',', '.');
    return {
      data_deposito: dataStr,
      moeda: cols[moedaIdx] || '',
      valor: parseFloat(valorStr) || 0,
      tipo: cols[tipoIdx] || '',
      depositante: cols[depositanteIdx] || '',
      data_caixa: dataStr.split(' ')[0] || dataStr.substring(0, 10),
      turno: '',
      observacao: '',
    };
  });
}

function rowKey(r: { data_deposito: string; valor: number; depositante: string; tipo: string }) {
  return `${r.data_deposito}|${r.valor}|${r.depositante}|${r.tipo}`;
}

export default function DepositosBrinks() {
  const { selectedPostoId, role } = useAuth();
  const [importRows, setImportRows] = useState<BrinksRow[]>([]);
  const [loteId, setLoteId] = useState<string>('');
  const [valorBanco, setValorBanco] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);

  // All deposits for the posto
  const [allDepositos, setAllDepositos] = useState<DepositoCompleto[]>([]);
  const [loading, setLoading] = useState(false);

  // Conciliation state
  const [concSelected, setConcSelected] = useState<Set<string>>(new Set());
  const [concValorBanco, setConcValorBanco] = useState<string>('');
  const [concBancoId, setConcBancoId] = useState<string>('');
  const [contasBancarias, setContasBancarias] = useState<{ id: string; banco: string; agencia: string; conta: string }[]>([]);
  const [concSaving, setConcSaving] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState<string | null>('data_deposito');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Filter states - dropdown selection
  const [filterDepositante, setFilterDepositante] = useState<string>('all');
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [filterTurno, setFilterTurno] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterText, setFilterText] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Load all deposits
  const loadAllDepositos = useCallback(async () => {
    if (!selectedPostoId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('depositos_brinks')
      .select('id, data_deposito, moeda, valor, tipo, depositante, data_caixa, turno, observacao, conciliado_banco_id')
      .eq('posto_id', selectedPostoId)
      .order('data_deposito', { ascending: false });
    if (error) {
      toast.error('Erro ao carregar depósitos: ' + error.message);
    } else {
      setAllDepositos((data || []).map(d => ({
        id: d.id,
        data_deposito: d.data_deposito,
        moeda: d.moeda,
        valor: d.valor,
        tipo: d.tipo,
        depositante: d.depositante,
        data_caixa: d.data_caixa || '',
        turno: d.turno || '',
        observacao: d.observacao || '',
        conciliado_banco_id: d.conciliado_banco_id,
      })));
    }
    setLoading(false);
  }, [selectedPostoId]);

  const loadContasBancarias = useCallback(async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('contas_bancarias')
      .select('id, banco, agencia, conta')
      .eq('posto_id', selectedPostoId)
      .order('banco');
    setContasBancarias((data as { id: string; banco: string; agencia: string; conta: string }[]) || []);
  }, [selectedPostoId]);

  useEffect(() => {
    if (selectedPostoId) {
      loadAllDepositos();
      loadContasBancarias();
    }
  }, [selectedPostoId, loadAllDepositos, loadContasBancarias]);

  // Extract unique values for dropdown filters
  const uniqueDepositantes = useMemo(() => [...new Set(allDepositos.map(d => d.depositante).filter(Boolean))].sort(), [allDepositos]);
  const uniqueTipos = useMemo(() => [...new Set(allDepositos.map(d => d.tipo).filter(Boolean))].sort(), [allDepositos]);
  const uniqueTurnos = useMemo(() => [...new Set(allDepositos.map(d => d.turno).filter(Boolean))].sort(), [allDepositos]);

  // Sort toggle
  const toggleSort = (field: string) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortField(null);
      setSortDir(null);
    }
  };

  // Filtered & sorted data
  const filteredData = useMemo(() => {
    let data = allDepositos;

    if (filterDepositante !== 'all') data = data.filter(d => d.depositante === filterDepositante);
    if (filterTipo !== 'all') data = data.filter(d => d.tipo === filterTipo);
    if (filterTurno !== 'all') data = data.filter(d => d.turno === filterTurno);
    if (filterStatus === 'pendente') data = data.filter(d => !d.conciliado_banco_id);
    if (filterStatus === 'conciliado') data = data.filter(d => !!d.conciliado_banco_id);

    if (filterText.trim()) {
      const q = filterText.toLowerCase();
      data = data.filter(r =>
        r.depositante.toLowerCase().includes(q) ||
        r.tipo.toLowerCase().includes(q) ||
        r.observacao.toLowerCase().includes(q) ||
        r.data_deposito.toLowerCase().includes(q) ||
        r.moeda.toLowerCase().includes(q)
      );
    }

    if (sortField && sortDir) {
      data = [...data].sort((a, b) => {
        const va = (a as any)[sortField];
        const vb = (b as any)[sortField];
        if (typeof va === 'number' && typeof vb === 'number') {
          return sortDir === 'asc' ? va - vb : vb - va;
        }
        const sa = String(va || '').toLowerCase();
        const sb = String(vb || '').toLowerCase();
        return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }

    return data;
  }, [allDepositos, filterDepositante, filterTipo, filterTurno, filterStatus, filterText, sortField, sortDir]);

  const concTotalSelected = allDepositos
    .filter(d => concSelected.has(d.id))
    .reduce((sum, d) => sum + Number(d.valor), 0);

  const toggleConcSelect = (id: string) => {
    setConcSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const pendingIds = filteredData.filter(d => !d.conciliado_banco_id).map(d => d.id);
    const allSelected = pendingIds.every(id => concSelected.has(id));
    if (allSelected) {
      setConcSelected(prev => {
        const next = new Set(prev);
        pendingIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setConcSelected(prev => {
        const next = new Set(prev);
        pendingIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const handleReceberBanco = async () => {
    if (concSelected.size === 0) { toast.error('Selecione ao menos um depósito'); return; }
    if (!concBancoId) { toast.error('Selecione uma conta bancária'); return; }
    setConcSaving(true);
    const ids = Array.from(concSelected);
    const { error } = await supabase
      .from('depositos_brinks')
      .update({ conciliado_banco_id: concBancoId })
      .in('id', ids);
    if (error) {
      toast.error('Erro ao conciliar: ' + error.message);
    } else {
      toast.success(`${ids.length} depósito(s) conciliado(s)`);
      setConcSelected(new Set());
      setConcValorBanco('');
      loadAllDepositos();
    }
    setConcSaving(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    let parsed: BrinksRow[];

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      parsed = parseXLSX(buffer);
    } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      const text = await file.text();
      parsed = parseHTML(text);
    } else {
      const text = await file.text();
      parsed = parseCSV(text);
    }

    if (parsed.length === 0) {
      toast.error('Nenhum dado encontrado no arquivo');
      return;
    }

    const { data: existing } = await supabase
      .from('depositos_brinks')
      .select('data_deposito, valor, depositante, tipo')
      .eq('posto_id', selectedPostoId!);

    const existingKeys = new Set((existing || []).map(r => rowKey(r)));
    const uniqueRows = parsed.filter(r => !existingKeys.has(rowKey(r)));
    const dupsCount = parsed.length - uniqueRows.length;
    setDuplicatesRemoved(dupsCount);

    if (uniqueRows.length === 0) {
      toast.warning('Todos os registros do arquivo já foram importados anteriormente.');
      return;
    }

    setImportRows(uniqueRows);
    setLoteId(crypto.randomUUID());
    setIsImporting(true);

    if (dupsCount > 0) {
      toast.success(`${uniqueRows.length} registros novos importados. ${dupsCount} duplicados ignorados.`);
    } else {
      toast.success(`${uniqueRows.length} registros importados`);
    }
  };

  const updateImportRow = (index: number, field: keyof BrinksRow, value: string) => {
    setImportRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const totalBrinks = importRows.reduce((sum, r) => sum + r.valor, 0);
  const valorBancoNum = parseFloat(valorBanco.replace(/\./g, '').replace(',', '.')) || 0;
  const diferenca = totalBrinks - valorBancoNum;

  const parseDateBR = (dateStr: string): string => {
    const parts = dateStr.trim().split(' ');
    const datePart = parts[0];
    const timePart = parts[1] || '00:00:00';
    const [day, month, year] = datePart.split('/');
    if (day && month && year && year.length === 4) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}`;
    }
    return dateStr;
  };

  const parseDateOnlyBR = (dateStr: string): string => {
    const [day, month, year] = dateStr.trim().split('/');
    if (day && month && year && year.length === 4) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return dateStr;
  };

  const handleSave = async () => {
    if (!selectedPostoId || !loteId) return;
    setSaving(true);

    const inserts = importRows.map(r => ({
      posto_id: selectedPostoId,
      lote_id: loteId,
      data_deposito: parseDateBR(r.data_deposito),
      moeda: r.moeda,
      valor: r.valor,
      tipo: r.tipo,
      depositante: r.depositante,
      data_caixa: r.data_caixa ? parseDateOnlyBR(r.data_caixa) : null,
      turno: r.turno || null,
      observacao: r.observacao || null,
    }));

    const { error } = await supabase.from('depositos_brinks').insert(inserts);
    if (error) {
      toast.error('Erro ao salvar: ' + error.message);
      setSaving(false);
      return;
    }

    toast.success('Depósitos salvos com sucesso!');
    setImportRows([]);
    setIsImporting(false);
    loadAllDepositos();
    setSaving(false);
  };

  const handleUpdateRow = async (dep: DepositoCompleto) => {
    const { error } = await supabase.from('depositos_brinks')
      .update({ data_caixa: dep.data_caixa || null, turno: dep.turno || null, observacao: dep.observacao || null })
      .eq('id', dep.id);
    if (error) toast.error('Erro: ' + error.message);
    else toast.success('Atualizado');
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const totalFiltered = filteredData.reduce((sum, r) => sum + r.valor, 0);

  const activeFilterCount = [filterDepositante, filterTipo, filterTurno, filterStatus].filter(f => f !== 'all').length;

  if (!selectedPostoId) {
    return <p className="text-muted-foreground text-center py-8">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h1 className="text-xl font-bold">Depósitos Brinks</h1>
        <div className="flex gap-2 items-center">
          <label className="cursor-pointer">
            <input type="file" accept=".csv,.html,.htm,.xlsx,.xls" className="hidden" onChange={handleFile} />
            <Button asChild variant="default" size="sm">
              <span><Upload className="w-4 h-4 mr-1" />Importar Arquivo</span>
            </Button>
          </label>
        </div>
      </div>

      {/* Import view */}
      {isImporting && importRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Importação — {importRows.length} registros
              {duplicatesRemoved > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({duplicatesRemoved} duplicados ignorados)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data Depósito</TableHead>
                  <TableHead>Moeda</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Depositante</TableHead>
                  <TableHead>Data Caixa</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importRows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-nowrap">{row.data_deposito}</TableCell>
                    <TableCell className="text-xs">{row.moeda}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatCurrency(row.valor)}</TableCell>
                    <TableCell className="text-xs">{row.tipo}</TableCell>
                    <TableCell className="text-xs">{row.depositante}</TableCell>
                    <TableCell>
                      <Input type="date" className="h-8 text-xs w-32" value={row.data_caixa} onChange={e => updateImportRow(i, 'data_caixa', e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Select value={row.turno} onValueChange={v => updateImportRow(i, 'turno', v)}>
                        <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="Turno" /></SelectTrigger>
                        <SelectContent>{TURNOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 text-xs w-32" value={row.observacao} onChange={e => updateImportRow(i, 'observacao', e.target.value)} placeholder="Observação" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total Brinks:</span>
                <span className="font-bold text-lg">{formatCurrency(totalBrinks)}</span>
              </div>
              {role === 'admin' && (
                <>
                  <div className="flex items-center gap-3 justify-between">
                    <span className="font-semibold">Valor recebido no banco:</span>
                    <Input className="h-9 w-48 text-right" value={valorBanco} onChange={e => setValorBanco(e.target.value)} placeholder="0,00" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Diferença:</span>
                    <span className={`font-bold text-lg ${diferenca === 0 ? 'text-green-600' : diferenca > 0 ? 'text-yellow-600' : 'text-destructive'}`}>
                      {formatCurrency(diferenca)}
                    </span>
                  </div>
                </>
              )}
              <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
                <Save className="w-4 h-4 mr-1" />
                {saving ? 'Salvando...' : 'Salvar Depósitos'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unified deposits table */}
      {!isImporting && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <CardTitle className="text-base">
                Todos os Depósitos
                {loading && <span className="text-sm font-normal text-muted-foreground ml-2">Carregando...</span>}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant={showFilters ? 'secondary' : 'outline'} size="sm" onClick={() => setShowFilters(!showFilters)}>
                  <Filter className="w-4 h-4 mr-1" />
                  Filtros
                  {activeFilterCount > 0 && (
                    <Badge variant="default" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Filters area */}
            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 bg-muted/50 rounded-lg">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pendente">Pendentes</SelectItem>
                      <SelectItem value="conciliado">Conciliados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Depositante</label>
                  <Select value={filterDepositante} onValueChange={setFilterDepositante}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueDepositantes.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                  <Select value={filterTipo} onValueChange={setFilterTipo}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueTipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Turno</label>
                  <Select value={filterTurno} onValueChange={setFilterTurno}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {uniqueTurnos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Busca livre</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input className="pl-7 h-8 text-xs" placeholder="Buscar..." value={filterText} onChange={e => setFilterText(e.target.value)} />
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setFilterDepositante('all'); setFilterTipo('all'); setFilterTurno('all'); setFilterStatus('all'); setFilterText(''); }}>
                      Limpar filtros
                    </Button>
                  </div>
                )}
              </div>
            )}

            {allDepositos.length === 0 && !loading ? (
              <p className="text-muted-foreground text-center py-6 text-sm">
                Nenhum depósito importado ainda. Use o botão "Importar Arquivo" acima.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {role === 'admin' && (
                          <TableHead className="w-10">
                            <Checkbox
                              checked={(() => {
                                const pendingIds = filteredData.filter(d => !d.conciliado_banco_id).map(d => d.id);
                                return pendingIds.length > 0 && pendingIds.every(id => concSelected.has(id));
                              })()}
                              onCheckedChange={selectAllFiltered}
                            />
                          </TableHead>
                        )}
                        <TableHead className="w-20">Status</TableHead>
                        <SortableHead label="Data Depósito" active={sortField === 'data_deposito'} dir={sortDir} onClick={() => toggleSort('data_deposito')} />
                        <SortableHead label="Moeda" active={sortField === 'moeda'} dir={sortDir} onClick={() => toggleSort('moeda')} />
                        <SortableHead label="Valor" active={sortField === 'valor'} dir={sortDir} onClick={() => toggleSort('valor')} className="text-right" />
                        <SortableHead label="Tipo" active={sortField === 'tipo'} dir={sortDir} onClick={() => toggleSort('tipo')} />
                        <SortableHead label="Depositante" active={sortField === 'depositante'} dir={sortDir} onClick={() => toggleSort('depositante')} />
                        <SortableHead label="Data Caixa" active={sortField === 'data_caixa'} dir={sortDir} onClick={() => toggleSort('data_caixa')} />
                        <TableHead>Turno</TableHead>
                        <TableHead>Observação</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.map(dep => {
                        const isConciliado = !!dep.conciliado_banco_id;
                        const isSelected = concSelected.has(dep.id);
                        return (
                          <TableRow key={dep.id} className={cn(
                            isConciliado && 'bg-green-50 dark:bg-green-950/20',
                            isSelected && !isConciliado && 'bg-accent/50'
                          )}>
                            {role === 'admin' && (
                              <TableCell>
                                {!isConciliado ? (
                                  <Checkbox checked={isSelected} onCheckedChange={() => toggleConcSelect(dep.id)} />
                                ) : (
                                  <CheckCircle className="w-4 h-4 text-green-600" />
                                )}
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge variant={isConciliado ? 'default' : 'secondary'} className={cn("text-[10px]", isConciliado && 'bg-green-600 hover:bg-green-700')}>
                                {isConciliado ? 'Conciliado' : 'Pendente'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{new Date(dep.data_deposito).toLocaleString('pt-BR')}</TableCell>
                            <TableCell className="text-xs">{dep.moeda}</TableCell>
                            <TableCell className="text-right text-xs font-medium">{formatCurrency(dep.valor)}</TableCell>
                            <TableCell className="text-xs">{dep.tipo}</TableCell>
                            <TableCell className="text-xs">{dep.depositante}</TableCell>
                            <TableCell>
                              <Input
                                type="date"
                                className="h-8 text-xs w-32"
                                value={dep.data_caixa}
                                onChange={e => {
                                  setAllDepositos(prev => prev.map(d => d.id === dep.id ? { ...d, data_caixa: e.target.value } : d));
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={dep.turno}
                                onValueChange={v => {
                                  setAllDepositos(prev => prev.map(d => d.id === dep.id ? { ...d, turno: v } : d));
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="Turno" /></SelectTrigger>
                                <SelectContent>{TURNOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8 text-xs w-32"
                                value={dep.observacao}
                                onChange={e => {
                                  setAllDepositos(prev => prev.map(d => d.id === dep.id ? { ...d, observacao: e.target.value } : d));
                                }}
                                placeholder="Obs"
                              />
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost" onClick={() => handleUpdateRow(dep)}>
                                <Save className="w-3 h-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Footer: total + conciliation controls */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">{filteredData.length} depósitos — Total:</span>
                    <span className="font-bold text-lg">{formatCurrency(totalFiltered)}</span>
                  </div>

                  {role === 'admin' && concSelected.size > 0 && (
                    <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">Total selecionado ({concSelected.size} depósitos):</span>
                        <span className="font-bold text-lg">{formatCurrency(concTotalSelected)}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium">Conta bancária</span>
                          <Select value={concBancoId} onValueChange={setConcBancoId}>
                            <SelectTrigger className="w-[280px] h-9 text-sm"><SelectValue placeholder="Selecionar conta" /></SelectTrigger>
                            <SelectContent>
                              {contasBancarias.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.banco} — Ag {c.agencia} / Cc {c.conta}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium">Valor creditado no banco (R$)</span>
                          <Input className="h-9 w-48 text-right" value={concValorBanco} onChange={e => setConcValorBanco(e.target.value)} placeholder="0,00" />
                        </div>
                        <Button onClick={handleReceberBanco} disabled={concSaving || concSelected.size === 0 || !concBancoId} className="h-9">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {concSaving ? 'Salvando...' : 'Receber no banco'}
                        </Button>
                      </div>
                      {(() => {
                        const vBanco = parseFloat(concValorBanco.replace(/\./g, '').replace(',', '.')) || 0;
                        const diff = concTotalSelected - vBanco;
                        const hasInput = concValorBanco.trim() !== '';
                        if (!hasInput) return null;
                        return (
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">Diferença:</span>
                            <span className={cn("font-bold text-lg", diff === 0 ? 'text-green-600' : diff > 0 ? 'text-yellow-600' : 'text-destructive')}>
                              {formatCurrency(diff)}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
