import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDateFilter } from '@/hooks/useDateFilter';
import { usePagination } from '@/hooks/usePagination';
import { DateFilter } from '@/components/DateFilter';
import { FilterableHead } from '@/components/FilterableHead';
import { PaginationControls } from '@/components/PaginationControls';
import { HorizontalScrollSync } from '@/components/HorizontalScrollSync';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { openInNewTab } from '@/lib/utils';
import { QrCode, Upload, Download, ChevronDown, ChevronRight, TrendingUp, Hash, Receipt } from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface PixTransacao {
  id: string;
  transacao_id: string;
  data_hora: string;
  valor_bruto: number;
  tarifa: number;
  tarifa_esperada: number;
  nome_pagador: string;
  nome_funcionario: string;
  pdv: string;
}

interface PixImportacao {
  id: string;
  file_path: string;
  file_name: string;
  periodo_inicio: string;
  periodo_fim: string;
  total_transacoes: number;
  criado_em: string;
  criado_por_nome: string | null;
}

interface PixConfig {
  tarifa_percentual: number;
  tarifa_minima: number;
}

interface ParseResult {
  vendas: PixVenda[];
  repasses: PixRepasse[];
  error?: string;
}

interface PixVenda {
  transacao_id: string;
  data_hora: string;
  valor_bruto: number;
  tarifa: number;
  tarifa_esperada: number;
  nome_pagador: string;
  nome_funcionario: string;
  pdv: string;
}

interface PixRepasse {
  data_hora: string;
  valor: number;
  dia_referencia: string;
}

type SortDir = 'asc' | 'desc' | null;

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDatetime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function excelDateToISO(val: unknown): string | null {
  if (val instanceof Date && !isNaN(val.getTime())) {
    const Y = val.getFullYear();
    const M = String(val.getMonth() + 1).padStart(2, '0');
    const D = String(val.getDate()).padStart(2, '0');
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D}T${h}:${m}:${s}`;
  }
  if (typeof val === 'string' && val.trim()) return val.trim().replace(' ', 'T');
  return null;
}

function previousDay(isoDatetime: string): string {
  const [y, m, d] = isoDatetime.split('T')[0].split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function calcTarifaEsperada(valorBruto: number, cfg: PixConfig): number {
  return Math.max(cfg.tarifa_minima, valorBruto * cfg.tarifa_percentual / 100);
}

// ─── xlsx parser ─────────────────────────────────────────────────────────────

function parsePixXLSX(buffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });

  if (jsonData.length < 2) {
    return { vendas: [], repasses: [], error: 'Planilha vazia ou sem dados.' };
  }

  const rawHeaders = (jsonData[0] as unknown[]).map(
    (h) => (h != null ? String(h) : '').trim().toUpperCase(),
  );

  const idx = (pred: (h: string) => boolean) => rawHeaders.findIndex(pred);

  const descIdx  = idx((h) => h.includes('DESCRI'));
  const dtIdx    = idx((h) => h.includes('DATA') && (h.includes('HORA') || h.includes('REGISTRO')));
  const valorIdx = idx((h) => h === 'VALOR');
  const txIdx    = idx((h) => h.includes('TRANSA'));
  const pagIdx   = idx((h) => h.includes('PAGADOR'));
  const funcIdx  = idx((h) => h.includes('FUNCION'));
  const pdvIdx   = idx((h) => h === 'PDV');

  if (descIdx === -1 || dtIdx === -1 || valorIdx === -1 || txIdx === -1) {
    return {
      vendas: [],
      repasses: [],
      error: 'Colunas não encontradas. O arquivo deve conter: Descrição, Data/Hora do Registro, Valor e Transação.',
    };
  }

  const tarifaMap = new Map<string, number>();
  const vendaRows: Omit<PixVenda, 'tarifa_esperada'>[] = [];
  const repasses: PixRepasse[] = [];

  for (const row of jsonData.slice(1)) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const cols = row as unknown[];

    const desc = (cols[descIdx] != null ? String(cols[descIdx]) : '').trim().toUpperCase();
    const rawValor = cols[valorIdx];
    const valor = typeof rawValor === 'number'
      ? rawValor
      : parseFloat((rawValor != null ? String(rawValor) : '').replace(',', '.')) || 0;
    const transacaoId = (cols[txIdx] != null ? String(cols[txIdx]) : '').trim();
    const dataHora = excelDateToISO(cols[dtIdx]);

    if (!dataHora) continue;

    if (desc === 'CREDITO DE PAGAMENTO VIA PIX') {
      if (!transacaoId) continue;
      vendaRows.push({
        transacao_id:     transacaoId,
        data_hora:        dataHora,
        valor_bruto:      valor,
        tarifa:           0,
        nome_pagador:     pagIdx  >= 0 && cols[pagIdx]  != null ? String(cols[pagIdx]).trim()  : '',
        nome_funcionario: funcIdx >= 0 && cols[funcIdx] != null ? String(cols[funcIdx]).trim() : '',
        pdv:              pdvIdx  >= 0 && cols[pdvIdx]  != null ? String(cols[pdvIdx]).trim()  : '',
      });
    } else if (desc === 'DEBITO DE TARIFA PIX') {
      if (transacaoId) tarifaMap.set(transacaoId, Math.abs(valor));
    } else if (desc === 'PIX ENVIADO') {
      repasses.push({
        data_hora:      dataHora,
        valor:          Math.abs(valor),
        dia_referencia: previousDay(dataHora),
      });
    }
  }

  const vendas: PixVenda[] = vendaRows.map((v) => ({
    ...v,
    tarifa:          tarifaMap.get(v.transacao_id) ?? 0,
    tarifa_esperada: 0,
  }));

  return { vendas, repasses };
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ConciliacaoPix() {
  const { selectedPostoId, nome } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── import state ───────────────────────────────────────────────────────────
  const [importing, setImporting] = useState(false);

  // ── data state ─────────────────────────────────────────────────────────────
  const [transacoes,  setTransacoes]  = useState<PixTransacao[]>([]);
  const [importacoes, setImportacoes] = useState<PixImportacao[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [showImportacoes, setShowImportacoes] = useState(false);

  // ── date filter ────────────────────────────────────────────────────────────
  const { preset: dfPreset, range: dfRange, setPreset: setDfPreset } = useDateFilter('thisMonth');

  // ── sort/filter state ──────────────────────────────────────────────────────
  const [sortField, setSortField] = useState<'nome_funcionario' | 'nome_pagador' | null>(null);
  const [sortDir,   setSortDir]   = useState<SortDir>(null);
  const [excludedFunc, setExcludedFunc] = useState<Set<string>>(new Set());
  const [excludedPag,  setExcludedPag]  = useState<Set<string>>(new Set());

  // ── data loading ───────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!selectedPostoId) return;
    setLoadingData(true);
    const [txRes, impRes] = await Promise.all([
      (supabase as any)
        .from('pix_transacoes')
        .select('id, transacao_id, data_hora, valor_bruto, tarifa, tarifa_esperada, nome_pagador, nome_funcionario, pdv')
        .eq('posto_id', selectedPostoId)
        .gte('data_hora', dfRange.start + 'T00:00:00')
        .lte('data_hora', dfRange.end + 'T23:59:59')
        .order('data_hora', { ascending: false }),
      (supabase as any)
        .from('pix_importacoes')
        .select('id, file_path, file_name, periodo_inicio, periodo_fim, total_transacoes, criado_em, criado_por_nome')
        .eq('posto_id', selectedPostoId)
        .order('criado_em', { ascending: false }),
    ]);

    if (txRes.error) toast.error('Erro ao carregar transações: ' + txRes.error.message);
    setTransacoes(
      (txRes.data || []).map((t: any) => ({
        id:               t.id,
        transacao_id:     t.transacao_id,
        data_hora:        t.data_hora,
        valor_bruto:      safeNum(t.valor_bruto),
        tarifa:           safeNum(t.tarifa),
        tarifa_esperada:  safeNum(t.tarifa_esperada),
        nome_pagador:     t.nome_pagador     || '',
        nome_funcionario: t.nome_funcionario || '',
        pdv:              t.pdv              || '',
      })),
    );

    if (impRes.error) toast.error('Erro ao carregar importações: ' + impRes.error.message);
    setImportacoes(impRes.data || []);

    setLoadingData(false);
  }, [selectedPostoId, dfRange.start, dfRange.end]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── derived data ───────────────────────────────────────────────────────────
  const uniqueFuncs = useMemo(
    () => [...new Set(transacoes.map((t) => t.nome_funcionario))].sort(),
    [transacoes],
  );
  const uniquePags = useMemo(
    () => [...new Set(transacoes.map((t) => t.nome_pagador))].sort(),
    [transacoes],
  );

  const filteredData = useMemo(() => {
    let data = transacoes;
    if (excludedFunc.size > 0) data = data.filter((t) => !excludedFunc.has(t.nome_funcionario));
    if (excludedPag.size  > 0) data = data.filter((t) => !excludedPag.has(t.nome_pagador));
    if (sortField && sortDir) {
      data = [...data].sort((a, b) => {
        const va = String(a[sortField] || '').toLowerCase();
        const vb = String(b[sortField] || '').toLowerCase();
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return data;
  }, [transacoes, excludedFunc, excludedPag, sortField, sortDir]);

  const pag = usePagination(filteredData, [excludedFunc, excludedPag, sortField, sortDir, dfRange]);

  // Summary cards computed from ALL date-filtered rows (before FilterableHead filters)
  const totalVendas   = useMemo(() => transacoes.reduce((s, t) => s + t.valor_bruto, 0), [transacoes]);
  const totalTarifas  = useMemo(() => transacoes.reduce((s, t) => s + t.tarifa,      0), [transacoes]);
  const qtdTransacoes = transacoes.length;

  // ── sort toggle ────────────────────────────────────────────────────────────
  function toggleSort(field: 'nome_funcionario' | 'nome_pagador') {
    if (sortField !== field) { setSortField(field); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortField(null); setSortDir(null); }
  }

  // ── download importação ────────────────────────────────────────────────────
  async function handleDownload(filePath: string) {
    const { data, error } = await supabase.storage
      .from('pix-extratos')
      .createSignedUrl(filePath, 60);
    if (error || !data?.signedUrl) {
      toast.error('Erro ao gerar link de download');
      return;
    }
    openInNewTab(data.signedUrl);
  }

  // ── file change ────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    doImport(file);
  }

  // ── import ─────────────────────────────────────────────────────────────────
  async function doImport(file: File) {
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const { vendas, repasses, error: parseError } = parsePixXLSX(buffer);

      if (parseError) { toast.error(parseError); return; }
      if (vendas.length === 0 && repasses.length === 0) {
        toast.error('Nenhuma transação reconhecida no arquivo.');
        return;
      }

      const { data: cfgRaw } = await (supabase as any)
        .from('pix_config')
        .select('tarifa_percentual, tarifa_minima')
        .eq('posto_id', selectedPostoId)
        .maybeSingle();
      const cfg: PixConfig = {
        tarifa_percentual: cfgRaw?.tarifa_percentual ?? 0.2,
        tarifa_minima:     cfgRaw?.tarifa_minima     ?? 0.15,
      };

      const vendasFinal = vendas.map((v) => ({
        ...v,
        tarifa_esperada: calcTarifaEsperada(v.valor_bruto, cfg),
      }));

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${selectedPostoId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('pix-extratos')
        .upload(filePath, file, { contentType: file.type });
      if (uploadError) throw new Error('Erro ao enviar arquivo: ' + uploadError.message);

      const allDates = [
        ...vendasFinal.map((v) => v.data_hora.split('T')[0]),
        ...repasses.map((r) => r.data_hora.split('T')[0]),
      ].sort();
      const { data: importRow, error: importError } = await (supabase as any)
        .from('pix_importacoes')
        .insert({
          posto_id:         selectedPostoId,
          file_path:        filePath,
          file_name:        file.name,
          periodo_inicio:   allDates[0],
          periodo_fim:      allDates[allDates.length - 1],
          total_transacoes: vendasFinal.length,
          criado_por_nome:  nome ?? null,
        })
        .select('id')
        .single();
      if (importError) throw new Error('Erro ao registrar importação: ' + importError.message);
      const importacaoId: string = importRow.id;

      const allTxIds = vendasFinal.map((v) => v.transacao_id);
      let existingCount = 0;
      if (allTxIds.length > 0) {
        const { data: existing } = await (supabase as any)
          .from('pix_transacoes')
          .select('transacao_id')
          .in('transacao_id', allTxIds);
        existingCount = (existing || []).length;
      }

      if (vendasFinal.length > 0) {
        const { error: txError } = await (supabase as any)
          .from('pix_transacoes')
          .upsert(
            vendasFinal.map((v) => ({
              posto_id:         selectedPostoId,
              importacao_id:    importacaoId,
              transacao_id:     v.transacao_id,
              data_hora:        v.data_hora,
              valor_bruto:      v.valor_bruto,
              tarifa:           v.tarifa,
              tarifa_esperada:  v.tarifa_esperada,
              nome_pagador:     v.nome_pagador,
              nome_funcionario: v.nome_funcionario,
              pdv:              v.pdv,
            })),
            { onConflict: 'transacao_id', ignoreDuplicates: true },
          );
        if (txError) throw new Error('Erro ao salvar transações: ' + txError.message);
      }

      let existingRepassesCount = 0;
      if (repasses.length > 0) {
        const { data: existingRep } = await (supabase as any)
          .from('pix_repasses')
          .select('data_hora')
          .eq('posto_id', selectedPostoId)
          .in('data_hora', repasses.map((r) => r.data_hora));
        existingRepassesCount = (existingRep || []).length;
      }

      if (repasses.length > 0) {
        const { error: repError } = await (supabase as any)
          .from('pix_repasses')
          .upsert(
            repasses.map((r) => ({
              posto_id:       selectedPostoId,
              data_hora:      r.data_hora,
              valor:          r.valor,
              dia_referencia: r.dia_referencia,
              valor_esperado: 0,
              status:         'pendente',
            })),
            { onConflict: 'posto_id,data_hora', ignoreDuplicates: true },
          );
        if (repError) throw new Error('Erro ao salvar repasses: ' + repError.message);
      }

      const novas      = vendasFinal.length - existingCount;
      const jaExistiam = existingCount;
      const novosRep   = repasses.length - existingRepassesCount;

      toast.success(
        `${novas} transaç${novas === 1 ? 'ão nova' : 'ões novas'}` +
        (jaExistiam > 0 ? `, ${jaExistiam} já existiam` : '') +
        `, ${novosRep} repasse${novosRep === 1 ? '' : 's'}`,
      );

      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado na importação');
    } finally {
      setImporting(false);
    }
  }

  // ── empty state ────────────────────────────────────────────────────────────
  if (!selectedPostoId) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Selecione um posto para continuar.
      </p>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Conciliação Pix</h1>
        </div>
        <Button
          className="gap-2 text-xs"
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          {importing ? 'Importando...' : 'Importar Extrato'}
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Date filter */}
      <DateFilter
        preset={dfPreset}
        range={dfRange}
        onChange={setDfPreset}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total de Vendas Pix</p>
                <p className="text-lg font-bold leading-tight">R$ {fmtBRL(totalVendas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 shrink-0">
                <Hash className="h-4 w-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Transações</p>
                <p className="text-lg font-bold leading-tight">{qtdTransacoes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 shrink-0">
                <Receipt className="h-4 w-4 text-orange-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total de Tarifas</p>
                <p className="text-lg font-bold leading-tight">R$ {fmtBRL(totalTarifas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions table */}
      <HorizontalScrollSync>
        <div className="rounded-md border">
          <div className="overflow-x-auto" data-table-scroll-viewport>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap text-xs">Data/Hora</TableHead>
                  <TableHead className="whitespace-nowrap text-xs text-right">Valor (R$)</TableHead>
                  <TableHead className="whitespace-nowrap text-xs text-right">Tarifa (R$)</TableHead>
                  <FilterableHead
                    label={<span className="text-xs">Pagador</span>}
                    sortActive={sortField === 'nome_pagador'}
                    sortDir={sortField === 'nome_pagador' ? sortDir : null}
                    onSort={() => toggleSort('nome_pagador')}
                    uniqueValues={uniquePags}
                    selectedValues={excludedPag}
                    onFilterChange={setExcludedPag}
                    className="whitespace-nowrap"
                  />
                  <FilterableHead
                    label={<span className="text-xs">Funcionário</span>}
                    sortActive={sortField === 'nome_funcionario'}
                    sortDir={sortField === 'nome_funcionario' ? sortDir : null}
                    onSort={() => toggleSort('nome_funcionario')}
                    uniqueValues={uniqueFuncs}
                    selectedValues={excludedFunc}
                    onFilterChange={setExcludedFunc}
                    className="whitespace-nowrap"
                  />
                  <TableHead className="whitespace-nowrap text-xs">PDV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingData ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : pag.paginatedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-8">
                      {transacoes.length === 0
                        ? 'Nenhuma transação no período. Importe um extrato para começar.'
                        : 'Nenhuma transação com os filtros selecionados.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  pag.paginatedData.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs whitespace-nowrap">{fmtDatetime(t.data_hora)}</TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap font-medium">
                        {fmtBRL(t.valor_bruto)}
                      </TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap">
                        {fmtBRL(t.tarifa)}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate">{t.nome_pagador || '—'}</TableCell>
                      <TableCell className="text-xs max-w-[140px] truncate">{t.nome_funcionario || '—'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{t.pdv || '—'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={pag.page}
            totalPages={pag.totalPages}
            pageSize={pag.pageSize}
            totalItems={pag.totalItems}
            startIndex={pag.startIndex}
            endIndex={pag.endIndex}
            onPageChange={pag.setPage}
            onPageSizeChange={pag.handlePageSizeChange}
            itemLabel="transações"
            sessionKey="pix_pageSize"
          />
        </div>
      </HorizontalScrollSync>

      {/* Importações section */}
      <div className="rounded-md border">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          onClick={() => setShowImportacoes((v) => !v)}
        >
          <span>Importações ({importacoes.length})</span>
          {showImportacoes
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showImportacoes && (
          <div className="border-t divide-y">
            {importacoes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Nenhuma importação registrada.
              </p>
            ) : (
              importacoes.map((imp) => (
                <div key={imp.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-xs font-medium">{imp.file_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Período: {fmtDate(imp.periodo_inicio)} – {fmtDate(imp.periodo_fim)}
                      {' · '}{imp.total_transacoes} transaç{imp.total_transacoes === 1 ? 'ão' : 'ões'}
                      {imp.criado_por_nome ? ` · ${imp.criado_por_nome}` : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Importado em {fmtDatetime(imp.criado_em)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs shrink-0"
                    onClick={() => handleDownload(imp.file_path)}
                    title="Baixar arquivo original"
                  >
                    <Download className="w-3 h-3" />
                    Baixar
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

    </div>
  );
}
