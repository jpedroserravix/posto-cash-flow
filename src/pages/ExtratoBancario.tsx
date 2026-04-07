import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';

interface ExtratoRow {
  id: string;
  data_lancamento: string;
  valor: number;
  memo: string;
  tipo: string;
  conciliado: boolean;
  fitid: string;
  deposito_brinks_ids: string[] | null;
}

interface OFXTransaction {
  dtposted: string;
  trnamt: number;
  fitid: string;
  memo: string;
  trntype: string;
}

function parseOFX(text: string): OFXTransaction[] {
  const transactions: OFXTransaction[] = [];
  const blocks = text.split('<STMTTRN>').slice(1);

  for (const block of blocks) {
    const endIdx = block.indexOf('</STMTTRN>');
    const content = endIdx >= 0 ? block.substring(0, endIdx) : block;

    const getTag = (tag: string): string => {
      const regex = new RegExp(`<${tag}>([^<\\n]+)`, 'i');
      const match = content.match(regex);
      return match ? match[1].trim() : '';
    };

    const dtRaw = getTag('DTPOSTED');
    // Convert 20260323000000[-3:GMT] → 2026-03-23
    const dtClean = dtRaw.replace(/\[.*\]/, '');
    const year = dtClean.substring(0, 4);
    const month = dtClean.substring(4, 6);
    const day = dtClean.substring(6, 8);
    const dtposted = `${year}-${month}-${day}`;

    const trnamt = parseFloat(getTag('TRNAMT').replace(',', '.')) || 0;
    const fitid = getTag('FITID');
    const memo = getTag('MEMO');
    const trntype = getTag('TRNTYPE');

    if (fitid && year) {
      transactions.push({ dtposted, trnamt, fitid, memo, trntype });
    }
  }

  return transactions;
}

export default function ExtratoBancario() {
  const { selectedPostoId } = useAuth();
  const [contasBancarias, setContasBancarias] = useState<{ id: string; banco: string; agencia: string; conta: string }[]>([]);
  const [selectedContaId, setSelectedContaId] = useState<string>('');
  const [extrato, setExtrato] = useState<ExtratoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('todos');

  const loadContas = useCallback(async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('contas_bancarias')
      .select('id, banco, agencia, conta')
      .eq('posto_id', selectedPostoId)
      .order('banco');
    setContasBancarias(data || []);
    if (data && data.length > 0 && !selectedContaId) {
      setSelectedContaId(data[0].id);
    }
  }, [selectedPostoId]);

  const loadExtrato = useCallback(async () => {
    if (!selectedPostoId || !selectedContaId) { setExtrato([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('extrato_bancario')
      .select('id, data_lancamento, valor, memo, tipo, conciliado, fitid, deposito_brinks_ids')
      .eq('posto_id', selectedPostoId)
      .eq('conta_bancaria_id', selectedContaId)
      .order('data_lancamento', { ascending: false });
    if (error) toast.error('Erro ao carregar extrato: ' + error.message);
    else setExtrato((data || []).map(d => ({
      ...d,
      memo: d.memo || '',
      tipo: d.tipo || '',
      deposito_brinks_ids: d.deposito_brinks_ids as string[] | null,
    })));
    setLoading(false);
  }, [selectedPostoId, selectedContaId]);

  useEffect(() => { loadContas(); }, [loadContas]);
  useEffect(() => { loadExtrato(); }, [loadExtrato]);

  const handleImportOFX = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPostoId || !selectedContaId) return;
    e.target.value = '';

    setImporting(true);
    try {
      const text = await file.text();
      const transactions = parseOFX(text);

      if (transactions.length === 0) {
        toast.error('Nenhuma transação encontrada no arquivo OFX');
        setImporting(false);
        return;
      }

      // Get existing fitids for deduplication
      const { data: existing } = await supabase
        .from('extrato_bancario')
        .select('fitid')
        .eq('conta_bancaria_id', selectedContaId);
      const existingFitids = new Set((existing || []).map(e => e.fitid));

      const newTransactions = transactions.filter(t => !existingFitids.has(t.fitid));

      if (newTransactions.length === 0) {
        toast.info('Todas as transações já foram importadas anteriormente');
        setImporting(false);
        return;
      }

      // Insert new transactions
      const toInsert = newTransactions.map(t => ({
        posto_id: selectedPostoId,
        conta_bancaria_id: selectedContaId,
        fitid: t.fitid,
        data_lancamento: t.dtposted,
        valor: t.trnamt,
        memo: t.memo,
        tipo: t.trntype,
        conciliado: false,
        deposito_brinks_ids: null as string[] | null,
      }));

      const { error: insertError } = await supabase
        .from('extrato_bancario')
        .insert(toInsert);

      if (insertError) {
        toast.error('Erro ao importar: ' + insertError.message);
        setImporting(false);
        return;
      }

      // Bidirectional reconciliation for CREDITO COFRE INTELIGENTE entries
      const candidates = newTransactions.filter(t =>
        t.memo.toUpperCase().includes('CREDITO COFRE INTELIGENTE') && t.trnamt > 0
      );

      let reconciled = 0;

      for (const candidate of candidates) {
        // Find pending Brinks deposits (conciliado_banco_id IS NULL) for this posto
        const { data: pendingDeposits } = await supabase
          .from('depositos_brinks')
          .select('id, valor')
          .eq('posto_id', selectedPostoId)
          .is('conciliado_banco_id', null);

        if (!pendingDeposits || pendingDeposits.length === 0) continue;

        // Try to find a subset whose sum matches the OFX amount
        const targetValue = Math.round(candidate.trnamt * 100);
        const matchingIds = findMatchingSubset(pendingDeposits, targetValue);

        if (matchingIds.length > 0) {
          // Update extrato as conciliado
          await supabase
            .from('extrato_bancario')
            .update({ conciliado: true, deposito_brinks_ids: matchingIds })
            .eq('conta_bancaria_id', selectedContaId)
            .eq('fitid', candidate.fitid);

          // Update depositos_brinks with conciliado_banco_id
          await supabase
            .from('depositos_brinks')
            .update({ conciliado_banco_id: selectedContaId })
            .in('id', matchingIds);

          reconciled++;
        }
      }

      const skipped = transactions.length - newTransactions.length;
      let msg = `${newTransactions.length} lançamento(s) importado(s)`;
      if (skipped > 0) msg += `, ${skipped} duplicado(s) ignorado(s)`;
      if (reconciled > 0) msg += `, ${reconciled} conciliado(s) automaticamente`;
      toast.success(msg);

      loadExtrato();
    } catch (err: any) {
      toast.error('Erro ao processar arquivo: ' + (err.message || err));
    }
    setImporting(false);
  };

  const filtered = useMemo(() => {
    if (filterStatus === 'conciliado') return extrato.filter(e => e.conciliado);
    if (filterStatus === 'pendente') return extrato.filter(e => !e.conciliado);
    return extrato;
  }, [extrato, filterStatus]);

  const totalCreditos = useMemo(() =>
    filtered.filter(e => e.valor > 0).reduce((s, e) => s + e.valor, 0), [filtered]);
  const totalDebitos = useMemo(() =>
    filtered.filter(e => e.valor < 0).reduce((s, e) => s + e.valor, 0), [filtered]);

  const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatDate = (d: string) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Extrato Bancário
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedContaId} onValueChange={setSelectedContaId}>
              <SelectTrigger className="w-[220px] h-9 text-sm">
                <SelectValue placeholder="Selecionar conta" />
              </SelectTrigger>
              <SelectContent>
                {contasBancarias.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.banco} - Ag {c.agencia} / Cc {c.conta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px] h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="conciliado">Conciliado</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="outline"
              disabled={!selectedContaId || importing}
              onClick={() => document.getElementById('ofx-input')?.click()}
            >
              <Upload className="w-4 h-4 mr-1" />
              {importing ? 'Importando...' : 'Importar OFX'}
            </Button>
            <input
              id="ofx-input"
              type="file"
              accept=".ofx"
              className="hidden"
              onChange={handleImportOFX}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : !selectedContaId ? (
          <div className="p-8 text-center text-muted-foreground">Selecione uma conta bancária</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Nenhum lançamento encontrado</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs text-right">Valor</TableHead>
                  <TableHead className="text-xs">Memo</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagination.paginatedData.map(row => (
                  <TableRow key={row.id} className={cn(row.conciliado && 'bg-green-50')}>
                    <TableCell className="text-xs whitespace-nowrap">{formatDate(row.data_lancamento)}</TableCell>
                    <TableCell className={cn('text-xs text-right whitespace-nowrap font-medium', row.valor < 0 ? 'text-destructive' : 'text-green-700')}>
                      {formatBRL(row.valor)}
                    </TableCell>
                    <TableCell className="text-xs max-w-[300px] truncate">{row.memo}</TableCell>
                    <TableCell className="text-xs">{row.tipo}</TableCell>
                    <TableCell className="text-xs text-center">
                      <Badge variant={row.conciliado ? 'default' : 'secondary'} className={cn('text-[10px]', row.conciliado && 'bg-green-600')}>
                        {row.conciliado ? 'Conciliado' : 'Pendente'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <div className="flex justify-between items-center px-4 py-2 text-sm">
              <div className="flex gap-4">
                <span>Créditos: <strong className="text-green-700">{formatBRL(totalCreditos)}</strong></span>
                <span>Débitos: <strong className="text-destructive">{formatBRL(totalDebitos)}</strong></span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Find a subset of deposits whose total (in cents) matches the target value.
 * Uses a simple greedy approach: try exact single match first, then group by date.
 */
function findMatchingSubset(
  deposits: { id: string; valor: number }[],
  targetCents: number
): string[] {
  // Try single match first
  for (const d of deposits) {
    if (Math.round(d.valor * 100) === targetCents) {
      return [d.id];
    }
  }

  // Try all deposits combined
  const totalCents = deposits.reduce((s, d) => s + Math.round(d.valor * 100), 0);
  if (totalCents === targetCents) {
    return deposits.map(d => d.id);
  }

  // Try subsets up to reasonable size (brute force for small sets)
  if (deposits.length <= 20) {
    for (let mask = 1; mask < (1 << deposits.length); mask++) {
      let sum = 0;
      const ids: string[] = [];
      for (let i = 0; i < deposits.length; i++) {
        if (mask & (1 << i)) {
          sum += Math.round(deposits[i].valor * 100);
          ids.push(deposits[i].id);
        }
      }
      if (sum === targetCents) return ids;
    }
  }

  return [];
}
