import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { Upload, Save, CalendarIcon, Search } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

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
  const [rows, setRows] = useState<BrinksRow[]>([]);
  const [savedRows, setSavedRows] = useState<BrinksRow[]>([]);
  const [loteId, setLoteId] = useState<string>('');
  const [valorBanco, setValorBanco] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'import' | 'history' | 'conciliacao'>('history');
  const [historyLotes, setHistoryLotes] = useState<string[]>([]);
  const [selectedLote, setSelectedLote] = useState<string>('');
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [concDataInicial, setConcDataInicial] = useState<Date | undefined>();
  const [concDataFinal, setConcDataFinal] = useState<Date | undefined>();
  const [concTotalBrinks, setConcTotalBrinks] = useState<number>(0);
  const [concValorBanco, setConcValorBanco] = useState<string>('');
  const [concLoading, setConcLoading] = useState(false);

  // Load history
  useEffect(() => {
    if (!selectedPostoId) return;
    loadHistory();
  }, [selectedPostoId]);

  const loadHistory = async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('depositos_brinks')
      .select('lote_id')
      .eq('posto_id', selectedPostoId)
      .order('created_at', { ascending: false });
    
    const lotes = [...new Set(data?.map(d => d.lote_id) || [])];
    setHistoryLotes(lotes);
    if (lotes.length > 0 && !selectedLote) {
      setSelectedLote(lotes[0]);
      loadLote(lotes[0]);
    }
  };

  const loadLote = async (lId: string) => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('depositos_brinks')
      .select('*')
      .eq('posto_id', selectedPostoId)
      .eq('lote_id', lId)
      .order('data_deposito', { ascending: true });
    
    setSavedRows(data?.map(d => ({
      id: d.id,
      data_deposito: d.data_deposito,
      moeda: d.moeda,
      valor: d.valor,
      tipo: d.tipo,
      depositante: d.depositante,
      data_caixa: d.data_caixa || '',
      turno: d.turno || '',
      observacao: d.observacao || '',
    })) || []);

  };

  const buscarConciliacao = async () => {
    if (!selectedPostoId || !concDataInicial || !concDataFinal) return;
    setConcLoading(true);
    const dataIni = format(concDataInicial, 'yyyy-MM-dd');
    const dataFim = format(concDataFinal, 'yyyy-MM-dd');
    const { data, error } = await supabase
      .from('depositos_brinks')
      .select('valor, tipo')
      .eq('posto_id', selectedPostoId)
      .gte('data_deposito', dataIni)
      .lte('data_deposito', dataFim + 'T23:59:59')
      .neq('tipo', 'OUTRO');
    if (error) {
      toast.error('Erro ao buscar depósitos: ' + error.message);
    } else {
      const total = (data || []).reduce((sum, r) => sum + Number(r.valor), 0);
      setConcTotalBrinks(total);
    }
    setConcLoading(false);
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

    // Remove duplicates against existing saved data
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

    setRows(uniqueRows);
    setLoteId(crypto.randomUUID());
    setViewMode('import');

    if (dupsCount > 0) {
      toast.success(`${uniqueRows.length} registros novos importados. ${dupsCount} duplicados ignorados.`);
    } else {
      toast.success(`${uniqueRows.length} registros importados`);
    }
  };

  const updateRow = (index: number, field: keyof BrinksRow, value: string) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const totalBrinks = rows.reduce((sum, r) => sum + r.valor, 0);
  const valorBancoNum = parseFloat(valorBanco.replace(/\./g, '').replace(',', '.')) || 0;
  const diferenca = totalBrinks - valorBancoNum;

  const savedTotal = savedRows.reduce((sum, r) => sum + r.valor, 0);

  const parseDateBR = (dateStr: string): string => {
    // Convert "DD/MM/YYYY HH:MM:SS" or "DD/MM/YYYY" to ISO format
    const parts = dateStr.trim().split(' ');
    const datePart = parts[0];
    const timePart = parts[1] || '00:00:00';
    const [day, month, year] = datePart.split('/');
    if (day && month && year && year.length === 4) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}`;
    }
    return dateStr; // Return as-is if already in a valid format
  };

  const parseDateOnlyBR = (dateStr: string): string => {
    // Convert "DD/MM/YYYY" to "YYYY-MM-DD"
    const [day, month, year] = dateStr.trim().split('/');
    if (day && month && year && year.length === 4) {
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return dateStr;
  };

  const handleSave = async () => {
    if (!selectedPostoId || !loteId) return;
    setSaving(true);

    const inserts = rows.map(r => ({
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
    setRows([]);
    setViewMode('history');
    loadHistory();
    setSaving(false);
  };

  const handleUpdateRow = async (row: BrinksRow) => {
    if (!row.id) return;
    const { error } = await supabase.from('depositos_brinks')
      .update({ data_caixa: row.data_caixa || null, turno: row.turno || null, observacao: row.observacao || null })
      .eq('id', row.id);
    if (error) toast.error('Erro: ' + error.message);
    else toast.success('Atualizado');
  };


  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
          <Button variant={viewMode === 'history' ? 'secondary' : 'outline'} size="sm" onClick={() => setViewMode('history')}>Histórico</Button>
          {role === 'admin' && (
            <Button variant={viewMode === 'conciliacao' ? 'secondary' : 'outline'} size="sm" onClick={() => setViewMode('conciliacao')}>Conciliação</Button>
          )}
        </div>
      </div>

      {viewMode === 'import' && rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Importação — {rows.length} registros
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
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-nowrap">{row.data_deposito}</TableCell>
                    <TableCell className="text-xs">{row.moeda}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatCurrency(row.valor)}</TableCell>
                    <TableCell className="text-xs">{row.tipo}</TableCell>
                    <TableCell className="text-xs">{row.depositante}</TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        className="h-8 text-xs w-32"
                        value={row.data_caixa}
                        onChange={e => updateRow(i, 'data_caixa', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={row.turno} onValueChange={v => updateRow(i, 'turno', v)}>
                        <SelectTrigger className="h-8 text-xs w-28">
                          <SelectValue placeholder="Turno" />
                        </SelectTrigger>
                        <SelectContent>
                          {TURNOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-xs w-32"
                        value={row.observacao}
                        onChange={e => updateRow(i, 'observacao', e.target.value)}
                        placeholder="Observação"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Footer with totals */}
            <div className="mt-4 space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total Brinks:</span>
                <span className="font-bold text-lg">{formatCurrency(totalBrinks)}</span>
              </div>

              {role === 'admin' && (
                <>
                  <div className="flex items-center gap-3 justify-between">
                    <span className="font-semibold">Valor recebido no banco:</span>
                    <Input
                      className="h-9 w-48 text-right"
                      value={valorBanco}
                      onChange={e => setValorBanco(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Diferença:</span>
                    <span className={`font-bold text-lg ${
                      diferenca === 0 ? 'text-success' : diferenca > 0 ? 'text-warning' : 'text-destructive'
                    }`}>
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

      {/* History */}
      {viewMode === 'history' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Histórico de Importações</CardTitle>
            {historyLotes.length > 0 && (
              <Select value={selectedLote} onValueChange={v => { setSelectedLote(v); loadLote(v); }}>
                <SelectTrigger className="w-48 h-9 text-xs">
                  <SelectValue placeholder="Selecionar lote" />
                </SelectTrigger>
                <SelectContent>
                  {historyLotes.map((l, i) => (
                    <SelectItem key={l} value={l}>Lote {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardHeader>
          <CardContent>
            {savedRows.length === 0 ? (
              <p className="text-muted-foreground text-center py-6 text-sm">
                Nenhum depósito importado ainda. Use o botão "Importar Arquivo" acima.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
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
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {savedRows.map((row, i) => (
                        <TableRow key={row.id || i}>
                          <TableCell className="text-xs whitespace-nowrap">{new Date(row.data_deposito).toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-xs">{row.moeda}</TableCell>
                          <TableCell className="text-right text-xs font-medium">{formatCurrency(row.valor)}</TableCell>
                          <TableCell className="text-xs">{row.tipo}</TableCell>
                          <TableCell className="text-xs">{row.depositante}</TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              className="h-8 text-xs w-32"
                              value={row.data_caixa}
                              onChange={e => {
                                const updated = [...savedRows];
                                updated[i] = { ...updated[i], data_caixa: e.target.value };
                                setSavedRows(updated);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={row.turno}
                              onValueChange={v => {
                                const updated = [...savedRows];
                                updated[i] = { ...updated[i], turno: v };
                                setSavedRows(updated);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs w-28">
                                <SelectValue placeholder="Turno" />
                              </SelectTrigger>
                              <SelectContent>
                                {TURNOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8 text-xs w-32"
                              value={row.observacao}
                              onChange={e => {
                                const updated = [...savedRows];
                                updated[i] = { ...updated[i], observacao: e.target.value };
                                setSavedRows(updated);
                              }}
                              placeholder="Obs"
                            />
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => handleUpdateRow(savedRows[i])}>
                              <Save className="w-3 h-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="mt-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Total do lote:</span>
                    <span className="font-bold text-lg">{formatCurrency(savedTotal)}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Conciliação Bancária - Admin only */}
      {viewMode === 'conciliacao' && role === 'admin' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conciliação Bancária</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Data Inicial</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !concDataInicial && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {concDataInicial ? format(concDataInicial, 'dd/MM/yyyy') : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={concDataInicial} onSelect={setConcDataInicial} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Data Final</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal", !concDataFinal && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {concDataFinal ? format(concDataFinal, 'dd/MM/yyyy') : 'Selecionar'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={concDataFinal} onSelect={setConcDataFinal} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-end">
                <Button onClick={buscarConciliacao} disabled={!concDataInicial || !concDataFinal || concLoading} size="sm">
                  <Search className="w-4 h-4 mr-1" />
                  {concLoading ? 'Buscando...' : 'Buscar'}
                </Button>
              </div>
            </div>

            {concTotalBrinks > 0 && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Total Brinks no período (excluindo OUTRO):</span>
                  <span className="font-bold text-lg">{formatCurrency(concTotalBrinks)}</span>
                </div>
                <div className="flex items-center gap-3 justify-between">
                  <span className="font-semibold">Valor creditado no banco (R$):</span>
                  <Input
                    className="h-9 w-48 text-right"
                    value={concValorBanco}
                    onChange={e => setConcValorBanco(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                {(() => {
                  const vBanco = parseFloat(concValorBanco.replace(/\./g, '').replace(',', '.')) || 0;
                  const diff = concTotalBrinks - vBanco;
                  const hasInput = concValorBanco.trim() !== '';
                  if (!hasInput) return null;
                  return (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Diferença:</span>
                      <span className={cn("font-bold text-lg",
                        diff === 0 ? 'text-green-600' : diff > 0 ? 'text-yellow-600' : 'text-red-600'
                      )}>
                        {formatCurrency(diff)}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
