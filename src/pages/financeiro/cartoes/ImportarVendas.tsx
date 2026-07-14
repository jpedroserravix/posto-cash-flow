import { useRef, useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { CreditCard, Upload, Check, AlertTriangle, Info } from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface PremmiaRow {
  cpf: string;
  nome: string;
  produto: string;
  valor_bruto: number;
  data_transacao: string;   // ISO "YYYY-MM-DDTHH:mm:ss"
  codigo_transacao: string;
  forma_pagamento: string;
  status: string;
  _dt_display: string;      // "DD/MM/YYYY HH:mm:ss" — para exibição
}

interface ImportResult {
  importadas: number;
  jaExistiam: number;
  erros: { codigo: string; motivo: string }[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normStr(s: string): string {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function parseBRLValue(v: unknown): number {
  // "1.234,56" → remove pontos (separador de milhar), troca vírgula por ponto
  const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseBRDatetime(v: unknown): string | null {
  // "DD/MM/YYYY HH:mm:ss" → "YYYY-MM-DDTHH:mm:ss"
  const s = String(v ?? '').trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, d, mo, y, h, mi, se] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${se}`;
}

// ─── parser Premmia "Conferência" ─────────────────────────────────────────────
// Colunas: CPF | Nome | Produto | Valor líquido | Data/Hora da transação |
//          Código Transação | Forma de Pagamento | Status
// "Valor líquido" é na prática o valor bruto da venda (nomenclatura do relatório).

function parsePremmiaXLSX(buffer: ArrayBuffer): { rows: PremmiaRow[]; error?: string } {
  const wb = XLSX.read(buffer, { type: 'array', raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });

  if (data.length < 2) return { rows: [], error: 'Planilha vazia ou sem dados.' };

  const headers = (data[0] as unknown[]).map((h) => normStr(String(h ?? '').trim()));
  const col = (kw: string) => headers.findIndex((h) => h.includes(normStr(kw)));

  const cpfIdx    = col('CPF');
  const nomeIdx   = col('NOME');
  const prodIdx   = col('PRODUTO');
  const valorIdx  = col('VALOR');   // "VALOR LIQUIDO"
  const dtIdx     = col('DATA');    // "DATA/HORA DA TRANSACAO"
  const codIdx    = col('CODIGO');  // "CODIGO TRANSACAO"
  const formaIdx  = col('FORMA');   // "FORMA DE PAGAMENTO"
  const statusIdx = col('STATUS');

  if (valorIdx === -1 || dtIdx === -1 || codIdx === -1) {
    return {
      rows: [],
      error:
        'Colunas obrigatórias não encontradas. ' +
        'Verifique se é o relatório Conferência da Premmia ' +
        '(deve conter: Valor, Data/Hora da transação, Código Transação).',
    };
  }

  const rows: PremmiaRow[] = [];
  for (const rawRow of (data as unknown[][]).slice(1)) {
    if (!Array.isArray(rawRow)) continue;
    const dtRaw     = String(rawRow[dtIdx]  ?? '').trim();
    const codigoRaw = String(rawRow[codIdx] ?? '').trim();
    const valorRaw  = String(rawRow[valorIdx] ?? '').trim();

    if (!codigoRaw || !dtRaw || !valorRaw) continue;

    const dt = parseBRDatetime(dtRaw);
    if (!dt) continue;

    rows.push({
      cpf:              cpfIdx    >= 0 ? String(rawRow[cpfIdx]    ?? '').trim() : '',
      nome:             nomeIdx   >= 0 ? String(rawRow[nomeIdx]   ?? '').trim() : '',
      produto:          prodIdx   >= 0 ? String(rawRow[prodIdx]   ?? '').trim() : '',
      valor_bruto:      parseBRLValue(valorRaw),
      data_transacao:   dt,
      codigo_transacao: codigoRaw,
      forma_pagamento:  formaIdx  >= 0 ? String(rawRow[formaIdx]  ?? '').trim() : '',
      status:           statusIdx >= 0 ? String(rawRow[statusIdx] ?? '').trim() : '',
      _dt_display:      dtRaw,
    });
  }

  return { rows };
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ImportarVendasCartoes() {
  const { selectedPostoId, postoId, postoNome, allPostos, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importPostoId, setImportPostoId] = useState<string>(
    selectedPostoId || postoId || '',
  );
  const [adquirentes, setAdquirentes] = useState<string[]>([]);
  const [adquirente, setAdquirente]   = useState<string>('');
  const [rows, setRows]               = useState<PremmiaRow[]>([]);
  const [fileError, setFileError]     = useState<string | null>(null);
  const [importing, setImporting]     = useState(false);
  const [resultado, setResultado]     = useState<ImportResult | null>(null);

  // Sincroniza posto local quando o seletor global do header muda
  useEffect(() => {
    const next = selectedPostoId || postoId || '';
    if (next) setImportPostoId(next);
  }, [selectedPostoId, postoId]);

  // Carrega adquirentes configurados
  useEffect(() => {
    (supabase as any)
      .from('cartoes_config_modalidades')
      .select('adquirente')
      .eq('ativo', true)
      .then(({ data }: { data: { adquirente: string }[] | null }) => {
        const distinct = [...new Set((data || []).map((r) => r.adquirente))].sort();
        setAdquirentes(distinct);
        if (distinct.length > 0) setAdquirente((prev) => prev || distinct[0]);
      });
  }, []);

  // Opções de posto para o seletor local
  const postoOptions = useMemo(
    () =>
      allPostos.length > 0
        ? allPostos
        : postoId
        ? [{ id: postoId, nome: postoNome ?? 'Meu Posto', cnpj: '' }]
        : [],
    [allPostos, postoId, postoNome],
  );

  // Totais por forma de pagamento
  const totaisPorForma = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const r of rows) {
      const key = r.forma_pagamento || '—';
      const acc = map.get(key) ?? { count: 0, total: 0 };
      acc.count++;
      acc.total += r.valor_bruto;
      map.set(key, acc);
    }
    return [...map.entries()];
  }, [rows]);

  const totalGeral = useMemo(() => rows.reduce((s, r) => s + r.valor_bruto, 0), [rows]);

  // ── file handler ────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setResultado(null);
    setFileError(null);
    setRows([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const buf = ev.target?.result as ArrayBuffer;
        const { rows: parsed, error } = parsePremmiaXLSX(buf);
        if (error) { setFileError(error); toast.error(error); return; }
        if (parsed.length === 0) {
          const msg = 'Nenhuma linha válida encontrada no arquivo.';
          setFileError(msg);
          toast.error(msg);
          return;
        }
        setRows(parsed);
        toast.success(`${parsed.length} transações lidas — revise o preview e clique em Importar.`);
      } catch (err: unknown) {
        const msg = 'Erro ao processar arquivo: ' + (err instanceof Error ? err.message : String(err));
        setFileError(msg);
        toast.error(msg);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── import handler ──────────────────────────────────────────────────────────

  async function handleImport() {
    if (!importPostoId || !adquirente || rows.length === 0 || importing) return;
    setImporting(true);
    setResultado(null);

    try {
      // 1. Pré-verificar quais códigos já existem para evitar erros desnecessários
      const codigos = rows.map((r) => r.codigo_transacao);
      const { data: existing } = await (supabase as any)
        .from('cartoes_vendas')
        .select('codigo_transacao')
        .eq('adquirente', adquirente)
        .in('codigo_transacao', codigos);

      const existSet = new Set<string>(
        ((existing as { codigo_transacao: string }[]) || []).map((e) => e.codigo_transacao),
      );

      const novas = rows.filter((r) => !existSet.has(r.codigo_transacao));
      let jaExistiam = rows.length - novas.length;

      if (novas.length === 0) {
        setResultado({ importadas: 0, jaExistiam, erros: [] });
        toast.info('Todas as transações do arquivo já estavam importadas.');
        return;
      }

      const toInsert = novas.map((r) => ({
        posto_id:         importPostoId,
        adquirente,
        cpf:              r.cpf             || null,
        nome:             r.nome            || null,
        produto:          r.produto         || null,
        valor_bruto:      r.valor_bruto,
        data_transacao:   r.data_transacao,
        codigo_transacao: r.codigo_transacao,
        forma_pagamento:  r.forma_pagamento || null,
        status:           r.status          || null,
        importado_por:    user?.id          ?? null,
      }));

      // 2. Tenta insert em lote
      const { error: batchErr } = await (supabase as any)
        .from('cartoes_vendas')
        .insert(toInsert);

      if (!batchErr) {
        setResultado({ importadas: novas.length, jaExistiam, erros: [] });
        toast.success(`${novas.length} transações importadas com sucesso!`);
        return;
      }

      // 3. Fallback: inserção linha a linha para identificar erros individuais
      const erros: ImportResult['erros'] = [];
      let importadas = 0;

      for (const row of toInsert) {
        const { error: e } = await (supabase as any)
          .from('cartoes_vendas')
          .insert(row);
        if (!e) {
          importadas++;
        } else if ((e as any).code === '23505') {
          jaExistiam++;  // captura race-condition de duplicata
        } else {
          erros.push({
            codigo: row.codigo_transacao,
            motivo: (e as any).message ?? String(e),
          });
        }
      }

      setResultado({ importadas, jaExistiam, erros });
      if (erros.length === 0) {
        toast.success(`${importadas} transações importadas.`);
      } else {
        toast.warning(`${importadas} importadas, ${erros.length} com erro.`);
      }
    } catch (err: unknown) {
      toast.error('Erro inesperado: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImporting(false);
    }
  }

  const canImport = !!importPostoId && !!adquirente && rows.length > 0 && !importing;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Importar Vendas de Cartões</h1>
      </div>

      {/* Controles: posto + adquirente + upload */}
      <div className="flex flex-wrap items-center gap-3">
        {postoOptions.length > 1 ? (
          <Select value={importPostoId} onValueChange={setImportPostoId}>
            <SelectTrigger className="h-9 w-[200px] text-sm">
              <SelectValue placeholder="Selecionar posto" />
            </SelectTrigger>
            <SelectContent>
              {postoOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : postoOptions.length === 1 ? (
          <div className="h-9 flex items-center px-3 rounded-md border bg-muted/30 text-sm text-muted-foreground">
            {postoOptions[0].nome}
          </div>
        ) : null}

        {adquirentes.length > 0 && (
          <Select value={adquirente} onValueChange={setAdquirente}>
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <SelectValue placeholder="Adquirente" />
            </SelectTrigger>
            <SelectContent>
              {adquirentes.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          className="h-9 gap-2 text-xs"
          disabled={!importPostoId || !adquirente}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          Selecionar arquivo .xlsx
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Erro de arquivo */}
      {fileError && (
        <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-700 dark:bg-red-950/20 dark:text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {fileError}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <div className="space-y-3">

          {/* Resumo por forma + botão importar */}
          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-medium">
                {rows.length} transações lidas — {adquirente}
              </p>
              <Button
                className="h-9 gap-2 text-xs min-w-[180px]"
                disabled={!canImport}
                onClick={handleImport}
              >
                {importing
                  ? 'Importando...'
                  : `Importar ${rows.length} transações`}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1.5 pr-6 font-medium">Forma de Pagamento</th>
                    <th className="text-right py-1.5 pr-6 font-medium">Qtd.</th>
                    <th className="text-right py-1.5 font-medium">Total Bruto (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {totaisPorForma.map(([forma, acc]) => (
                    <tr key={forma} className="border-b border-border/40">
                      <td className="py-1.5 pr-6">{forma}</td>
                      <td className="text-right py-1.5 pr-6 tabular-nums">{acc.count}</td>
                      <td className="text-right py-1.5 font-medium tabular-nums">{fmtBRL(acc.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="pt-2 pr-6">Total Geral</td>
                    <td className="text-right pt-2 pr-6 tabular-nums">{rows.length}</td>
                    <td className="text-right pt-2 tabular-nums">{fmtBRL(totalGeral)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Tabela de preview detalhada */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap text-xs">Código Transação</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Data/Hora</TableHead>
                  <TableHead className="whitespace-nowrap text-xs text-right">Valor Bruto (R$)</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Forma de Pagamento</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">CPF</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Nome</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Produto</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-mono whitespace-nowrap">{r.codigo_transacao}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r._dt_display}</TableCell>
                    <TableCell className="text-xs text-right whitespace-nowrap font-medium tabular-nums">
                      {fmtBRL(r.valor_bruto)}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.forma_pagamento || '—'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.cpf || '—'}</TableCell>
                    <TableCell className="text-xs max-w-[140px] truncate">{r.nome || '—'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.produto || '—'}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.status || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Resultado da importação */}
      {resultado && (
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm font-medium">Resultado da importação</p>
          <div className="flex flex-wrap gap-3">
            <Badge className="bg-green-600 hover:bg-green-600 text-white gap-1.5 px-3 py-1.5 text-sm">
              <Check className="w-4 h-4 shrink-0" />
              {resultado.importadas} importada{resultado.importadas !== 1 ? 's' : ''}
            </Badge>
            {resultado.jaExistiam > 0 && (
              <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white gap-1.5 px-3 py-1.5 text-sm">
                <Info className="w-4 h-4 shrink-0" />
                {resultado.jaExistiam} já existia{resultado.jaExistiam !== 1 ? 'm' : ''}
              </Badge>
            )}
            {resultado.erros.length > 0 && (
              <Badge className="bg-red-500 hover:bg-red-500 text-white gap-1.5 px-3 py-1.5 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {resultado.erros.length} com erro
              </Badge>
            )}
          </div>
          {resultado.erros.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-xs font-medium text-red-600">Detalhes dos erros:</p>
              <div className="space-y-0.5">
                {resultado.erros.map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground">
                    <span className="font-mono">{e.codigo}</span>: {e.motivo}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estado vazio */}
      {rows.length === 0 && !fileError && (
        <p className="text-center text-muted-foreground text-sm py-10">
          Selecione o posto e a adquirente, depois clique em{' '}
          <span className="font-medium">Selecionar arquivo .xlsx</span> para
          visualizar e importar as vendas.
        </p>
      )}

    </div>
  );
}
