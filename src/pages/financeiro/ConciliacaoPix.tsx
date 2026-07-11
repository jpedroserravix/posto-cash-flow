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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { openInNewTab, formatarDataHoraLiteral } from '@/lib/utils';
import { useListaConfig } from '@/hooks/useListaConfig';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  QrCode, Upload, Download, ChevronDown, ChevronRight,
  TrendingUp, Hash, Receipt, RefreshCw, Plus, AlertTriangle, Trash2,
  Copy, Check, FileCheck2,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

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

interface PixRepasseRow {
  id: string;
  dia_referencia: string;
  data_hora: string;
  valor: number;
  valor_esperado: number;
  status: 'pendente' | 'conferido' | 'divergente';
}

interface PixConfig {
  tarifa_percentual: number;
  tarifa_minima: number;
}

interface ParseResult {
  vendas: PixVenda[];
  repasses: PixRepasse[];
  cnpj?: string;   // normalized (digits only), extracted from CNPJ column
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

interface FechamentoTurno {
  id: string;
  numero_turno: number;
  hora_corte: string;
  total_calculado: number;
  total_tarifa?: number; // somente em memória após cálculo, não salvo no DB
  status: 'pendente' | 'conferido' | 'divergente';
  observacao: string | null;
}

type SortDir = 'asc' | 'desc' | null;

// ─── quality types ────────────────────────────────────────────────────────────

interface QualityRow {
  docRef: string;
  valor: number;
  taxa: number;
  cliente: string;
  nomePagador: string;
}

interface SobrandoItem {
  quality: QualityRow;
  dbTx?: {
    data_hora: string;
    nome_funcionario: string;
    turno: number | 'sem_turno' | 'outro_dia' | null;
  };
  notFound: boolean;
}

interface QualityCompareResult {
  faltamNoCaixa: PixTransacao[];
  sobrando: SobrandoItem[];
  matchCount: number;
  totalValorMatch: number;
}

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

function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('T')[0].split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 1);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// Builds absolute ISO datetimes for each corte in user-defined order.
// When a corte's HH:MM ≤ previous corte's HH:MM, it has crossed midnight — advance the date.
function buildAbsoluteCortes(baseDate: string, corteStrings: string[]): string[] {
  const result: string[] = [];
  let currentDate = baseDate;
  let prevMinutes = -1;
  for (const corte of corteStrings) {
    const parts = corte.split(':').map(Number);
    const hh = parts[0] ?? 0;
    const mm = parts[1] ?? 0;
    const ss = parts[2] ?? 0;
    const totalMinutes = hh * 60 + mm;
    if (prevMinutes >= 0 && totalMinutes <= prevMinutes) {
      currentDate = nextDay(currentDate);
    }
    prevMinutes = totalMinutes;
    result.push(
      `${currentDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    );
  }
  return result;
}

function calcTarifaEsperada(valorBruto: number, cfg: PixConfig): number {
  return Math.max(cfg.tarifa_minima, valorBruto * cfg.tarifa_percentual / 100);
}

function fmtTime(t: string): string {
  if (!t) return '—';
  return t.substring(0, 5);
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
  const cnpjIdx  = idx((h) => h === 'CNPJ' || h.includes('CNPJ'));

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
  let cnpjFromFile: string | undefined;

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

    // Extrair CNPJ da primeira linha que tiver
    if (cnpjFromFile === undefined && cnpjIdx >= 0 && cols[cnpjIdx] != null) {
      const raw = String(cols[cnpjIdx]).trim();
      if (raw) cnpjFromFile = raw.replace(/\D/g, '');
    }

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

  return { vendas, repasses, cnpj: cnpjFromFile };
}

// ─── quality xlsx parser ──────────────────────────────────────────────────────
// Formato: Conta Origem | Documento de Referência (UUID) | Cliente | Conferido |
//          Conta | Plano de Conta | Valor ("R$ 1.234,56") | Taxa | Tipo | …

function parseQualityXLS(buffer: ArrayBuffer): { rows: QualityRow[]; error?: string } {
  const wb = XLSX.read(buffer, { type: 'array', raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false });

  if (data.length < 2) return { rows: [], error: 'Planilha vazia.' };

  const headers = (data[0] as unknown[]).map((h) => String(h ?? '').trim().toUpperCase());
  const col = (keyword: string) => headers.findIndex((h) => h.includes(keyword));

  const docRefIdx  = col('DOCUMENTO');
  const valorIdx   = col('VALOR');
  const taxaIdx    = col('TAXA');
  const tipoIdx    = col('TIPO');
  const clienteIdx = col('CLIENTE');
  const nomePagIdx = col('NOME PAGADOR');

  if (docRefIdx === -1 || valorIdx === -1 || tipoIdx === -1) {
    return {
      rows: [],
      error: 'Colunas não encontradas. Verifique se é o relatório Quality correto (deve conter Documento de Referência, Valor e Tipo).',
    };
  }

  const parseBRL = (v: unknown): number => {
    if (typeof v === 'number') return v;
    const s = String(v ?? '').replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
    return parseFloat(s) || 0;
  };

  const rows: QualityRow[] = [];
  for (const row of (data as unknown[][]).slice(1)) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const tipo = String(row[tipoIdx] ?? '').trim().toLowerCase();
    if (tipo !== 'crédito' && tipo !== 'credito') continue;
    const docRef = String(row[docRefIdx] ?? '').trim();
    if (!docRef) continue;
    rows.push({
      docRef,
      valor:      parseBRL(row[valorIdx]),
      taxa:       taxaIdx    >= 0 ? parseBRL(row[taxaIdx])                       : 0,
      cliente:    clienteIdx >= 0 ? String(row[clienteIdx] ?? '').trim()         : '',
      nomePagador: nomePagIdx >= 0 ? String(row[nomePagIdx] ?? '').trim()        : '',
    });
  }

  return { rows };
}

// ─── sub-component: status badge ─────────────────────────────────────────────

function RepasseStatusBadge({ status }: { status: PixRepasseRow['status'] }) {
  const cls = {
    conferido:  'bg-green-600 hover:bg-green-600 text-white',
    pendente:   'bg-yellow-500 hover:bg-yellow-500 text-white',
    divergente: 'bg-red-500 hover:bg-red-500 text-white',
  }[status];
  const label = { conferido: 'Conferido', pendente: 'Pendente', divergente: 'Divergente' }[status];
  return <Badge className={`${cls} text-[10px] whitespace-nowrap`}>{label}</Badge>;
}

// ─── sub-component: copy button ──────────────────────────────────────────────

function CopyBtn({ value }: { value: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copiar"
      className="ml-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-500" />
        : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ConciliacaoPix() {
  const { selectedPostoId, nome } = useAuth();
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const qualityFileRef = useRef<HTMLInputElement>(null);

  // ── import / recalc state ──────────────────────────────────────────────────
  const [importing,     setImporting]     = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // ── data state ─────────────────────────────────────────────────────────────
  const [transacoes,      setTransacoes]      = useState<PixTransacao[]>([]);
  const [importacoes,     setImportacoes]     = useState<PixImportacao[]>([]);
  const [repasses,        setRepasses]        = useState<PixRepasseRow[]>([]);
  const [loadingData,     setLoadingData]     = useState(false);
  const [showImportacoes, setShowImportacoes] = useState(false);
  const [showRepasses,    setShowRepasses]    = useState(true);
  const [showFechamento,  setShowFechamento]  = useState(true);

  // ── fechamento por turno state ─────────────────────────────────────────────
  const [fechamentoData,    setFechamentoData]    = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [fechamentoCc,      setFechamentoCc]      = useState<string>('PISTA');
  const [fechamentoTurnos,  setFechamentoTurnos]  = useState<FechamentoTurno[]>([]);
  const [fechamentoStatus,  setFechamentoStatus]  = useState<FechamentoTurno['status'] | null>(null);
  const [loadingFechamento, setLoadingFechamento] = useState(false);
  const [calculando,        setCalculando]        = useState(false);
  const [salvando,          setSalvando]          = useState(false);
  const [turnosDirty,       setTurnosDirty]       = useState(false);
  const [cortes,            setCortes]            = useState<string[]>(['', '', '']);
  const [semTurno,          setSemTurno]          = useState<{ count: number; valor: number } | null>(null);

  // ── quality dialog state ───────────────────────────────────────────────────
  const [qualityDialogTurno, setQualityDialogTurno] = useState<FechamentoTurno | null>(null);
  const [qualityResult,      setQualityResult]      = useState<QualityCompareResult | null>(null);
  const [qualityLoading,     setQualityLoading]     = useState(false);

  // ── dialogs de CNPJ e exclusão ─────────────────────────────────────────────
  type CnpjMismatch = { fileCnpj: string; postoNome: string; postoCnpj: string };
  type CnpjMissing  = { postoNome: string; pendingFile: File; pendingParsed: { vendas: ParseResult['vendas']; repasses: ParseResult['repasses'] } };
  type DeleteConfirm = { id: string; fileName: string; totalTransacoes: number; filePath: string };

  const [cnpjMismatch,   setCnpjMismatch]   = useState<CnpjMismatch | null>(null);
  const [cnpjMissing,    setCnpjMissing]    = useState<CnpjMissing  | null>(null);
  const [deleteConfirm,  setDeleteConfirm]  = useState<DeleteConfirm | null>(null);
  const [deletingImpId,  setDeletingImpId]  = useState<string | null>(null);

  // ── centros de custo (lista configurável) ──────────────────────────────────
  const centrosCusto = useListaConfig('centros_custo', ['PISTA']);

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
    const [txRes, impRes, repRes] = await Promise.all([
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
      (supabase as any)
        .from('pix_repasses')
        .select('id, dia_referencia, data_hora, valor, valor_esperado, status')
        .eq('posto_id', selectedPostoId)
        .order('dia_referencia', { ascending: false }),
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

    if (repRes.error) toast.error('Erro ao carregar repasses: ' + repRes.error.message);
    setRepasses(
      (repRes.data || []).map((r: any) => ({
        id:             r.id,
        dia_referencia: r.dia_referencia,
        data_hora:      r.data_hora,
        valor:          safeNum(r.valor),
        valor_esperado: safeNum(r.valor_esperado),
        status:         (r.status || 'pendente') as PixRepasseRow['status'],
      })),
    );

    setLoadingData(false);
  }, [selectedPostoId, dfRange.start, dfRange.end]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── conferência de repasses ────────────────────────────────────────────────
  // Para cada pix_repasse do posto, calcula valor_esperado como:
  //   SUM(valor_bruto) - SUM(tarifa) das transações do dia de referência.
  // Aritmética em centavos para evitar imprecisão de ponto flutuante.
  const calcularRepasses = useCallback(async (): Promise<void> => {
    if (!selectedPostoId) return;

    const { data: allRepasses, error } = await (supabase as any)
      .from('pix_repasses')
      .select('id, dia_referencia, valor')
      .eq('posto_id', selectedPostoId);

    if (error) throw new Error('Erro ao buscar repasses: ' + error.message);
    if (!allRepasses?.length) return;

    await Promise.all(
      (allRepasses as any[]).map(async (rep) => {
        const diaRef = rep.dia_referencia as string; // "YYYY-MM-DD"

        const { data: txns } = await (supabase as any)
          .from('pix_transacoes')
          .select('valor_bruto, tarifa')
          .eq('posto_id', selectedPostoId)
          .gte('data_hora', diaRef + 'T00:00:00')
          .lte('data_hora', diaRef + 'T23:59:59');

        const hasTxns = Array.isArray(txns) && txns.length > 0;
        let valorEsperado = 0;
        let status: PixRepasseRow['status'] = 'pendente';

        if (hasTxns) {
          const brutoCents  = (txns as any[]).reduce((s, t) => s + Math.round(safeNum(t.valor_bruto) * 100), 0);
          const tarifaCents = (txns as any[]).reduce((s, t) => s + Math.round(safeNum(t.tarifa)      * 100), 0);
          valorEsperado = (brutoCents - tarifaCents) / 100;
          status = Math.abs(safeNum(rep.valor) - valorEsperado) < 0.01 ? 'conferido' : 'divergente';
        }

        await (supabase as any)
          .from('pix_repasses')
          .update({ valor_esperado: valorEsperado, status })
          .eq('id', rep.id);
      }),
    );
  }, [selectedPostoId]);

  // ── carregar fechamento por turno ─────────────────────────────────────────
  const loadFechamento = useCallback(async () => {
    if (!selectedPostoId) return;
    setLoadingFechamento(true);
    const { data: fech } = await (supabase as any)
      .from('pix_fechamentos')
      .select('id, status')
      .eq('posto_id', selectedPostoId)
      .eq('data', fechamentoData)
      .eq('centro_custo', fechamentoCc)
      .maybeSingle();

    if (!fech) {
      setFechamentoTurnos([]);
      setFechamentoStatus(null);
      setSemTurno(null);
      setTurnosDirty(false);
      setLoadingFechamento(false);
      return;
    }

    setFechamentoStatus(fech.status as FechamentoTurno['status']);

    const { data: turnos } = await (supabase as any)
      .from('pix_fechamentos_turnos')
      .select('id, numero_turno, hora_corte, total_calculado, status, observacao')
      .eq('fechamento_id', fech.id)
      .order('numero_turno', { ascending: true });

    const loaded = (turnos || []).map((t: any) => ({
      id:              t.id,
      numero_turno:    t.numero_turno,
      hora_corte:      t.hora_corte,
      total_calculado: safeNum(t.total_calculado),
      status:          (t.status || 'pendente') as FechamentoTurno['status'],
      observacao:      t.observacao ?? null,
    }));

    setFechamentoTurnos(loaded);
    // Preencher inputs de corte com as horas salvas
    if (loaded.length > 0) setCortes(loaded.map((t) => t.hora_corte));
    setSemTurno(null);
    setTurnosDirty(false);
    setLoadingFechamento(false);
  }, [selectedPostoId, fechamentoData, fechamentoCc]);

  useEffect(() => { loadFechamento(); }, [loadFechamento]);

  // ── calcular turnos ────────────────────────────────────────────────────────
  // Distribui transações por horário de corte em ordem definida pelo usuário.
  // Cortes são convertidos em datetimes absolutos para lidar com virada de meia-noite.
  // turno_override tem prioridade quando definido.
  // total_calculado = SUM(valor_bruto); total_tarifa separado.
  async function calcularTurnos() {
    if (!selectedPostoId || !fechamentoData) return;

    // 1. Normalizar cortes na ordem do usuário — SEM sort (ordem é significativa para meia-noite)
    const validCortes = cortes
      .map((c) => c.trim())
      .filter((c) => /^\d{2}:\d{2}(:\d{2})?$/.test(c))
      .map((c) => (c.length === 5 ? c + ':00' : c));

    if (validCortes.length === 0) {
      toast.error('Informe ao menos um horário de corte antes de calcular.');
      return;
    }

    setCalculando(true);
    try {
      // 2. Converter cortes em datetimes absolutos (detecta cruzamento de meia-noite)
      const absoluteCortes = buildAbsoluteCortes(fechamentoData, validCortes);
      const lastAbsoluteCorte = absoluteCortes[absoluteCortes.length - 1];

      // 3. Verificar se o fechamento do dia anterior termina depois da meia-noite de fechamentoData.
      //    Se sim, as transações antes desse corte já pertencem ao turno anterior — excluir daqui.
      const prevDate = previousDay(fechamentoData + 'T12:00:00');
      let queryStart = fechamentoData + 'T00:00:00';

      const { data: prevFech } = await (supabase as any)
        .from('pix_fechamentos')
        .select('id')
        .eq('posto_id', selectedPostoId)
        .eq('data', prevDate)
        .eq('centro_custo', fechamentoCc)
        .maybeSingle();

      if (prevFech) {
        const { data: prevTurnos } = await (supabase as any)
          .from('pix_fechamentos_turnos')
          .select('hora_corte, numero_turno')
          .eq('fechamento_id', prevFech.id)
          .order('numero_turno', { ascending: true });

        if (Array.isArray(prevTurnos) && prevTurnos.length > 0) {
          const prevCorteStrings = (prevTurnos as any[]).map((t: any) => t.hora_corte as string);
          const prevAbsoluteCortes = buildAbsoluteCortes(prevDate, prevCorteStrings);
          const prevLastCorte = prevAbsoluteCortes[prevAbsoluteCortes.length - 1];
          // Se o último corte do dia anterior avançou para dentro de fechamentoData
          if (prevLastCorte > fechamentoData + 'T00:00:00') {
            queryStart = prevLastCorte;
          }
        }
      }

      // 4. Buscar transações no intervalo corrigido
      const { data: txns, error } = await (supabase as any)
        .from('pix_transacoes')
        .select('turno_override, valor_bruto, tarifa, data_hora')
        .eq('posto_id', selectedPostoId)
        .gte('data_hora', queryStart)
        .lte('data_hora', lastAbsoluteCorte);

      if (error) throw new Error(error.message);

      // 5. Distribuir por turno usando comparação de datetime completo
      type TurnoKey = number | 'sem_turno';
      type TurnoAccum = { brutoCents: number; tarifaCents: number; count: number };
      const groups = new Map<TurnoKey, TurnoAccum>();

      for (const t of (txns as any[] || [])) {
        const txDatetime = (t.data_hora as string).replace(' ', 'T');

        let key: TurnoKey;
        if (t.turno_override != null) {
          key = t.turno_override as number;
        } else {
          const idx = absoluteCortes.findIndex((c) => txDatetime <= c);
          key = idx === -1 ? 'sem_turno' : idx + 1;
        }

        const acc = groups.get(key) || { brutoCents: 0, tarifaCents: 0, count: 0 };
        acc.brutoCents  += Math.round(safeNum(t.valor_bruto) * 100);
        acc.tarifaCents += Math.round(safeNum(t.tarifa)      * 100);
        acc.count++;
        groups.set(key, acc);
      }

      // 6. Montar resultado — um FechamentoTurno por corte definido
      const definedNums = new Set(validCortes.map((_, i) => i + 1));
      const result: FechamentoTurno[] = validCortes.map((corte, idx) => {
        const num = idx + 1;
        const g = groups.get(num) || { brutoCents: 0, tarifaCents: 0, count: 0 };
        return {
          id:              '',
          numero_turno:    num,
          hora_corte:      corte, // mantém formato HH:MM:SS para salvar no DB
          total_calculado: g.brutoCents  / 100,
          total_tarifa:    g.tarifaCents / 100,
          status:          'pendente' as const,
          observacao:      null,
        };
      });

      // Turnos extras via turno_override fora do range de cortes definidos
      for (const [key, g] of Array.from(groups.entries())) {
        if (typeof key === 'number' && !definedNums.has(key)) {
          result.push({
            id:              '',
            numero_turno:    key,
            hora_corte:      '00:00:00',
            total_calculado: g.brutoCents  / 100,
            total_tarifa:    g.tarifaCents / 100,
            status:          'pendente' as const,
            observacao:      null,
          });
        }
      }
      result.sort((a, b) => a.numero_turno - b.numero_turno);

      setFechamentoTurnos(result);
      setTurnosDirty(true);

      // Transações sem turno (após último corte)
      const stAcc = groups.get('sem_turno');
      setSemTurno(stAcc && stAcc.count > 0
        ? { count: stAcc.count, valor: stAcc.brutoCents / 100 }
        : null,
      );

      if (result.length === 0) {
        toast.info('Nenhuma transação encontrada para essa data.');
      } else {
        const totalBruto = result.reduce((s, t) => s + t.total_calculado, 0);
        toast.success(
          `${result.length} turno${result.length !== 1 ? 's' : ''} calculado${result.length !== 1 ? 's' : ''} — R$ ${fmtBRL(totalBruto)} bruto.`,
        );
      }
    } catch (err: unknown) {
      toast.error('Erro ao calcular turnos: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCalculando(false);
    }
  }

  // ── salvar fechamento ──────────────────────────────────────────────────────
  async function salvarFechamento() {
    if (!selectedPostoId || fechamentoTurnos.length === 0) return;
    setSalvando(true);
    try {
      // 1. Upsert fechamento (cria ou atualiza); status sempre 'pendente' ao salvar novos turnos
      const { data: fech, error: fechError } = await (supabase as any)
        .from('pix_fechamentos')
        .upsert(
          { posto_id: selectedPostoId, data: fechamentoData, centro_custo: fechamentoCc, status: 'pendente' },
          { onConflict: 'posto_id,data,centro_custo' },
        )
        .select('id')
        .single();
      if (fechError) throw new Error(fechError.message);
      const fechamentoId: string = fech.id;

      // 2. Deletar turnos antigos
      const { error: delError } = await (supabase as any)
        .from('pix_fechamentos_turnos')
        .delete()
        .eq('fechamento_id', fechamentoId);
      if (delError) throw new Error(delError.message);

      // 3. Inserir novos turnos
      const { error: insError } = await (supabase as any)
        .from('pix_fechamentos_turnos')
        .insert(
          fechamentoTurnos.map((t) => ({
            fechamento_id:   fechamentoId,
            numero_turno:    t.numero_turno,
            hora_corte:      t.hora_corte,
            total_calculado: t.total_calculado,
            total_tarifa:    t.total_tarifa ?? 0,
            status:          t.status,
            observacao:      t.observacao,
          })),
        );
      if (insError) throw new Error(insError.message);

      toast.success('Fechamento salvo!');
      setTurnosDirty(false);
      loadFechamento();
    } catch (err: unknown) {
      toast.error('Erro ao salvar fechamento: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSalvando(false);
    }
  }

  // ── recalcular button handler ──────────────────────────────────────────────
  async function handleRecalcular() {
    if (!selectedPostoId) return;
    setRecalculating(true);
    try {
      await calcularRepasses();
      loadData();
    } catch (err: unknown) {
      toast.error('Erro ao calcular repasses: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRecalculating(false);
    }
  }

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

  const pag = usePagination(filteredData, [excludedFunc, excludedPag, sortField, sortDir, dfRange.start, dfRange.end]);

  // Mapa de turno por transação — baseado no fechamento selecionado (fechamentoData + turnos)
  // Só colore as transações que caem dentro do intervalo do fechamento atual.
  const txTurnoMap = useMemo(() => {
    const map = new Map<string, number | 'sem_turno'>();
    if (fechamentoTurnos.length === 0 || !fechamentoData) return map;
    const corteStrings = fechamentoTurnos.map((t) => t.hora_corte);
    const absoluteCortes = buildAbsoluteCortes(fechamentoData, corteStrings);
    const dayStart = fechamentoData + 'T00:00:00';
    const lastCorte = absoluteCortes[absoluteCortes.length - 1];
    for (const txn of transacoes) {
      const txDatetime = txn.data_hora.replace(' ', 'T');
      if (txDatetime < dayStart || txDatetime > lastCorte) continue;
      const idx = absoluteCortes.findIndex((c) => txDatetime <= c);
      map.set(txn.id, idx === -1 ? 'sem_turno' : idx + 1);
    }
    return map;
  }, [transacoes, fechamentoTurnos, fechamentoData]);

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

  // Fase 1: parse + validação de CNPJ. Só chama doImportCore se tudo ok.
  async function doImport(file: File) {
    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const { vendas, repasses: repassesFromFile, cnpj: fileCnpj, error: parseError } = parsePixXLSX(buffer);

      if (parseError) { toast.error(parseError); return; }
      if (vendas.length === 0 && repassesFromFile.length === 0) {
        toast.error('Nenhuma transação reconhecida no arquivo.');
        return;
      }

      // Validar CNPJ do posto vs. arquivo
      const { data: postoRow } = await supabase
        .from('postos')
        .select('nome, cnpj')
        .eq('id', selectedPostoId!)
        .maybeSingle();

      const postoCnpjNorm = postoRow?.cnpj ? (postoRow.cnpj as string).replace(/\D/g, '') : '';
      const postoNome     = postoRow?.nome ?? 'posto selecionado';

      if (fileCnpj && postoCnpjNorm && fileCnpj !== postoCnpjNorm) {
        // CNPJ diverge → bloquear e mostrar erro
        setCnpjMismatch({ fileCnpj, postoNome, postoCnpj: postoCnpjNorm });
        return;
      }

      if (fileCnpj && !postoCnpjNorm) {
        // Posto sem CNPJ cadastrado → pedir confirmação
        setCnpjMissing({ postoNome, pendingFile: file, pendingParsed: { vendas, repasses: repassesFromFile } });
        return;
      }

      // CNPJ ok ou coluna ausente no arquivo → prosseguir
      await doImportCore(file, vendas, repassesFromFile);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado na importação');
    } finally {
      setImporting(false);
    }
  }

  // Fase 2: gravar no banco (chamada depois que CNPJ foi validado/confirmado)
  async function doImportCore(
    file: File,
    vendas: ParseResult['vendas'],
    repassesFromFile: ParseResult['repasses'],
  ) {
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
        ...repassesFromFile.map((r) => r.data_hora.split('T')[0]),
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
      if (repassesFromFile.length > 0) {
        const { data: existingRep } = await (supabase as any)
          .from('pix_repasses')
          .select('data_hora')
          .eq('posto_id', selectedPostoId)
          .in('data_hora', repassesFromFile.map((r) => r.data_hora));
        existingRepassesCount = (existingRep || []).length;
      }

      if (repassesFromFile.length > 0) {
        const { error: repError } = await (supabase as any)
          .from('pix_repasses')
          .upsert(
            repassesFromFile.map((r) => ({
              posto_id:       selectedPostoId,
              importacao_id:  importacaoId,
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
      const novosRep   = repassesFromFile.length - existingRepassesCount;

      toast.success(
        `${novas} transaç${novas === 1 ? 'ão nova' : 'ões novas'}` +
        (jaExistiam > 0 ? `, ${jaExistiam} já existiam` : '') +
        `, ${novosRep} repasse${novosRep === 1 ? '' : 's'}`,
      );

      // Conferência automática após importação
      try { await calcularRepasses(); } catch { /* silently ignore */ }
      loadData();
  }

  // ── confirmar import quando posto sem CNPJ ────────────────────────────────
  async function handleCnpjMissingConfirm() {
    if (!cnpjMissing) return;
    const { pendingFile, pendingParsed } = cnpjMissing;
    setCnpjMissing(null);
    setImporting(true);
    try {
      await doImportCore(pendingFile, pendingParsed.vendas, pendingParsed.repasses);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado na importação');
    } finally {
      setImporting(false);
    }
  }

  // ── excluir importação ────────────────────────────────────────────────────
  async function handleDeleteImport() {
    if (!deleteConfirm) return;
    const { id, filePath } = deleteConfirm;
    setDeleteConfirm(null);
    setDeletingImpId(id);
    try {
      // Deletar registro (cascata para pix_transacoes e pix_repasses via FK)
      const { error: delErr } = await (supabase as any)
        .from('pix_importacoes')
        .delete()
        .eq('id', id);
      if (delErr) throw new Error('Erro ao excluir importação: ' + delErr.message);

      // Remover arquivo do bucket
      await supabase.storage.from('pix-extratos').remove([filePath]);

      toast.success('Importação excluída.');
      // Recalcular repasses e recarregar
      try { await calcularRepasses(); } catch { /* silently ignore */ }
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally {
      setDeletingImpId(null);
    }
  }

  // ── conferência quality ────────────────────────────────────────────────────

  async function compareQuality(turno: FechamentoTurno, qualityRows: QualityRow[]) {
    // Set A: transacao_id → PixTransacao para o turno selecionado (estado atual)
    const setA = new Map<string, PixTransacao>();
    for (const tx of transacoes) {
      if (txTurnoMap.get(tx.id) === turno.numero_turno) {
        setA.set(tx.transacao_id, tx);
      }
    }

    // Set B: docRef → QualityRow (apenas Crédito, já filtrado no parse)
    const setB = new Map<string, QualityRow>();
    for (const row of qualityRows) setB.set(row.docRef, row);

    // A − B: no extrato mas ausente no Quality
    const faltamNoCaixa: PixTransacao[] = [];
    for (const [id, tx] of setA) {
      if (!setB.has(id)) faltamNoCaixa.push(tx);
    }

    // B − A: no Quality mas fora deste turno → buscar no banco
    const sobrandoPairs = [...setB.entries()].filter(([id]) => !setA.has(id));
    const sobrando: SobrandoItem[] = [];

    if (sobrandoPairs.length > 0 && selectedPostoId) {
      const uuids = sobrandoPairs.map(([id]) => id);
      const { data: dbRows } = await (supabase as any)
        .from('pix_transacoes')
        .select('transacao_id, data_hora, nome_funcionario')
        .eq('posto_id', selectedPostoId)
        .in('transacao_id', uuids);

      const dbMap = new Map<string, { data_hora: string; nome_funcionario: string }>();
      for (const r of (dbRows || [])) dbMap.set(r.transacao_id, r);

      const corteStrings   = fechamentoTurnos.map((t) => t.hora_corte);
      const absoluteCortes = buildAbsoluteCortes(fechamentoData, corteStrings);
      const dayStart       = fechamentoData + 'T00:00:00';
      const lastCorte      = absoluteCortes[absoluteCortes.length - 1] ?? '';

      for (const [id, qRow] of sobrandoPairs) {
        const dbRow = dbMap.get(id);
        if (!dbRow) {
          sobrando.push({ quality: qRow, notFound: true });
          continue;
        }
        const txDatetime = dbRow.data_hora.replace(' ', 'T');
        let turnoInfo: number | 'sem_turno' | 'outro_dia' | null = 'outro_dia';
        if (txDatetime >= dayStart && txDatetime <= lastCorte) {
          const idx = absoluteCortes.findIndex((c) => txDatetime <= c);
          turnoInfo = idx === -1 ? 'sem_turno' : idx + 1;
        }
        sobrando.push({
          quality: qRow,
          dbTx: { data_hora: dbRow.data_hora, nome_funcionario: dbRow.nome_funcionario || '', turno: turnoInfo },
          notFound: false,
        });
      }
    }

    const matchCount     = [...setA.keys()].filter((id) => setB.has(id)).length;
    const totalValorMatch = [...setA.entries()]
      .filter(([id]) => setB.has(id))
      .reduce((s, [, tx]) => s + tx.valor_bruto, 0);

    setQualityResult({ faltamNoCaixa, sobrando, matchCount, totalValorMatch });
  }

  async function handleQualityFile(turno: FechamentoTurno, file: File) {
    setQualityLoading(true);
    setQualityResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const { rows, error } = parseQualityXLS(buffer);
      if (error) { toast.error(error); return; }
      if (rows.length === 0) { toast.error('Nenhuma linha de Crédito encontrada no relatório.'); return; }
      await compareQuality(turno, rows);
    } catch (err: unknown) {
      toast.error('Erro ao processar arquivo Quality: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setQualityLoading(false);
    }
  }

  // ── turno row color ────────────────────────────────────────────────────────
  function txTurnoBg(turno: number | 'sem_turno' | undefined): string {
    if (turno === undefined) return '';
    if (turno === 'sem_turno') return 'bg-orange-200';
    if (turno === 1) return 'bg-yellow-100';
    if (turno === 2) return 'bg-green-100';
    if (turno === 3) return 'bg-blue-100';
    return 'bg-purple-100';
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
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
      <DateFilter preset={dfPreset} range={dfRange} onChange={setDfPreset} />

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

      {/* Fechamento por Turno section */}
      <div className="rounded-md border">
        <button
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          onClick={() => setShowFechamento((v) => !v)}
        >
          <span>Fechamento por Turno</span>
          {showFechamento
            ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
            : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showFechamento && (
          <div className="border-t p-4 space-y-4">

            {/* Seletores: data + CC + status */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={fechamentoData}
                onChange={(e) => {
                  setFechamentoData(e.target.value);
                  if (e.target.value) setDfPreset('custom', e.target.value, e.target.value);
                }}
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Select value={fechamentoCc} onValueChange={setFechamentoCc}>
                <SelectTrigger className="h-9 w-[160px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {centrosCusto.map((cc) => (
                    <SelectItem key={cc} value={cc}>{cc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fechamentoStatus && !turnosDirty && (
                <RepasseStatusBadge status={fechamentoStatus} />
              )}
            </div>

            {/* Horários de corte por turno */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Horários de corte — hora da última venda de cada turno (do relatório de caixa)
              </p>
              {cortes.map((corte, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-14 shrink-0">Turno {idx + 1}</span>
                  <input
                    type="time"
                    step="1"
                    value={corte}
                    onChange={(e) => {
                      const next = [...cortes];
                      next[idx] = e.target.value;
                      setCortes(next);
                    }}
                    className="h-8 w-36 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  {cortes.length > 1 && (
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors px-1"
                      onClick={() => setCortes(cortes.filter((_, i) => i !== idx))}
                      title="Remover turno"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => setCortes([...cortes, ''])}
              >
                <Plus className="w-3 h-3" />
                Adicionar Turno
              </Button>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 text-xs"
                disabled={calculando || salvando || importing}
                onClick={calcularTurnos}
              >
                <RefreshCw className={`w-3 h-3 ${calculando ? 'animate-spin' : ''}`} />
                {calculando ? 'Calculando...' : 'Calcular Turnos'}
              </Button>
              <Button
                size="sm"
                className="h-9 gap-1.5 text-xs"
                disabled={!turnosDirty || salvando || fechamentoTurnos.length === 0}
                onClick={salvarFechamento}
              >
                {salvando ? 'Salvando...' : 'Salvar Fechamento'}
              </Button>
            </div>

            {/* Aviso: transações sem turno (após último corte) */}
            {semTurno && semTurno.count > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-300">
                <span className="shrink-0">⚠</span>
                <span>
                  {semTurno.count} transaç{semTurno.count === 1 ? 'ão' : 'ões'} (R$ {fmtBRL(semTurno.valor)}) ficaram após o último horário de corte e não foram atribuídas a nenhum turno.
                </span>
              </div>
            )}

            {/* Tabela de resultado */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap text-xs">Turno</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Hora de Corte</TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-right">Total Bruto (R$)</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Status</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Observação</TableHead>
                    <TableHead className="whitespace-nowrap text-xs"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingFechamento ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-6">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : fechamentoTurnos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-6">
                        {turnosDirty
                          ? 'Nenhuma transação encontrada para essa data.'
                          : `Nenhum fechamento salvo para ${fmtDate(fechamentoData)} — ${fechamentoCc}. Informe os horários e clique em Calcular Turnos.`}
                      </TableCell>
                    </TableRow>
                  ) : (
                    fechamentoTurnos.map((t) => (
                      <TableRow key={`${t.id || t.numero_turno}`}>
                        <TableCell className="text-xs font-medium whitespace-nowrap">
                          Turno {t.numero_turno}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {fmtTime(t.hora_corte)}
                        </TableCell>
                        <TableCell className="text-xs text-right whitespace-nowrap">
                          <div className="font-medium">{fmtBRL(t.total_calculado)}</div>
                          {t.total_tarifa !== undefined && t.total_tarifa > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              tarifa: {fmtBRL(t.total_tarifa)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <RepasseStatusBadge status={t.status} />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                          {t.observacao || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1.5 text-xs whitespace-nowrap"
                            onClick={() => { setQualityDialogTurno(t); setQualityResult(null); }}
                          >
                            <FileCheck2 className="w-3 h-3" />
                            Quality
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Repasses section */}
      <div className="rounded-md border">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground transition-colors"
            onClick={() => setShowRepasses((v) => !v)}
          >
            {showRepasses
              ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
              : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            <span>Repasses ({repasses.length})</span>
          </button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            disabled={recalculating || importing}
            onClick={handleRecalcular}
          >
            <RefreshCw className={`w-3 h-3 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Calculando...' : 'Recalcular'}
          </Button>
        </div>

        {showRepasses && (
          <div className="border-t overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap text-xs">Dia de Referência</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Data/Hora Repasse</TableHead>
                  <TableHead className="whitespace-nowrap text-xs text-right">Esperado (R$)</TableHead>
                  <TableHead className="whitespace-nowrap text-xs text-right">Recebido (R$)</TableHead>
                  <TableHead className="whitespace-nowrap text-xs text-right">Diferença (R$)</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingData ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-6">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : repasses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-6">
                      Nenhum repasse registrado. Importe um extrato para começar.
                    </TableCell>
                  </TableRow>
                ) : (
                  repasses.map((r) => {
                    const diff = r.valor - r.valor_esperado;
                    const diffNonZero = Math.abs(diff) >= 0.01;
                    const diffSign = diff > 0 ? '+' : '';
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap font-medium">
                          {fmtDate(r.dia_referencia)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatarDataHoraLiteral(r.data_hora)}
                        </TableCell>
                        <TableCell className="text-xs text-right whitespace-nowrap">
                          {fmtBRL(r.valor_esperado)}
                        </TableCell>
                        <TableCell className="text-xs text-right whitespace-nowrap font-medium">
                          {fmtBRL(r.valor)}
                        </TableCell>
                        <TableCell className={`text-xs text-right whitespace-nowrap font-medium ${diffNonZero ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {diffNonZero ? `${diffSign}${fmtBRL(diff)}` : '—'}
                        </TableCell>
                        <TableCell>
                          <RepasseStatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Extrato de Transações */}
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
                  pag.paginatedData.map((t) => {
                    const turno = txTurnoMap.get(t.id);
                    const rowBg = txTurnoBg(turno);
                    return (
                      <TableRow key={t.id} className={rowBg}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatarDataHoraLiteral(t.data_hora)}
                          {turno !== undefined && (
                            turno === 'sem_turno'
                              ? <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-orange-200 px-1 py-0.5 text-[10px] font-medium text-orange-800"><AlertTriangle className="h-2.5 w-2.5" />S/T</span>
                              : <span className="ml-1.5 inline-block rounded bg-black/10 px-1 py-0.5 text-[10px] font-medium">T{turno}</span>
                          )}
                        </TableCell>
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
                    );
                  })
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => handleDownload(imp.file_path)}
                      title="Baixar arquivo original"
                    >
                      <Download className="w-3 h-3" />
                      Baixar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      disabled={deletingImpId === imp.id}
                      onClick={() => setDeleteConfirm({
                        id: imp.id,
                        fileName: imp.file_name,
                        totalTransacoes: imp.total_transacoes,
                        filePath: imp.file_path,
                      })}
                      title="Excluir importação"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Dialog: conferência Quality por turno */}
      <Dialog
        open={!!qualityDialogTurno}
        onOpenChange={(open) => {
          if (!open) { setQualityDialogTurno(null); setQualityResult(null); }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Conferir Turno {qualityDialogTurno?.numero_turno} com Quality
            </DialogTitle>
            <DialogDescription>
              {fechamentoData && `${fmtDate(fechamentoData)} · ${fechamentoCc}`}
            </DialogDescription>
          </DialogHeader>

          <input
            ref={qualityFileRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file || !qualityDialogTurno) return;
              e.target.value = '';
              handleQualityFile(qualityDialogTurno, file);
            }}
          />

          <div className="space-y-4">
            {/* Upload */}
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-xs"
                disabled={qualityLoading}
                onClick={() => qualityFileRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                {qualityResult ? 'Trocar arquivo' : 'Selecionar relatório Quality (.xls/.xlsx)'}
              </Button>
              {qualityLoading && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Processando...
                </span>
              )}
            </div>

            {/* Resultado */}
            {qualityResult && (
              <div className="space-y-4">
                {qualityResult.faltamNoCaixa.length === 0 && qualityResult.sobrando.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-3 text-sm text-green-800 dark:border-green-700 dark:bg-green-950/20 dark:text-green-300">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>
                      Turno confere com o Quality ({qualityResult.matchCount} venda{qualityResult.matchCount !== 1 ? 's' : ''}, R$ {fmtBRL(qualityResult.totalValorMatch)})
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {qualityResult.matchCount} venda{qualityResult.matchCount !== 1 ? 's' : ''} conferem (R$ {fmtBRL(qualityResult.totalValorMatch)})
                      {qualityResult.faltamNoCaixa.length > 0 && ` · ${qualityResult.faltamNoCaixa.length} faltando no caixa`}
                      {qualityResult.sobrando.length > 0 && ` · ${qualityResult.sobrando.length} sobrando no caixa`}
                    </p>

                    {/* Faltam no caixa (A − B) */}
                    {qualityResult.faltamNoCaixa.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-red-600">
                          Faltam no caixa — {qualityResult.faltamNoCaixa.length} venda{qualityResult.faltamNoCaixa.length !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-muted-foreground -mt-1">
                          Presentes no extrato Mais Pagamentos mas ausentes no Quality → incluir no caixa
                        </p>
                        <div className="space-y-1.5">
                          {qualityResult.faltamNoCaixa.map((tx) => (
                            <div key={tx.id} className="rounded-md border bg-red-50/40 dark:bg-red-950/10 px-3 py-2 text-xs space-y-1">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Valor:</span>
                                  <span className="font-medium">R$ {fmtBRL(tx.valor_bruto)}</span>
                                  <CopyBtn value={String(tx.valor_bruto)} />
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Taxa:</span>
                                  <span>R$ {fmtBRL(tx.tarifa)}</span>
                                  <CopyBtn value={String(tx.tarifa)} />
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Pagador:</span>
                                  <span>{tx.nome_pagador || '—'}</span>
                                  {tx.nome_pagador && <CopyBtn value={tx.nome_pagador} />}
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Funcionário:</span>
                                  <span>{tx.nome_funcionario || '—'}</span>
                                  {tx.nome_funcionario && <CopyBtn value={tx.nome_funcionario} />}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-muted-foreground">Doc. Ref.:</span>
                                <span className="font-mono text-[10px] break-all">{tx.transacao_id}</span>
                                <CopyBtn value={tx.transacao_id} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sobrando no caixa (B − A) */}
                    {qualityResult.sobrando.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-orange-600">
                          Sobrando no caixa — {qualityResult.sobrando.length} venda{qualityResult.sobrando.length !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-muted-foreground -mt-1">
                          No relatório Quality mas fora deste turno no extrato → excluir ou mover
                        </p>
                        <div className="space-y-1.5">
                          {qualityResult.sobrando.map((item, i) => (
                            <div key={i} className="rounded-md border bg-orange-50/40 dark:bg-orange-950/10 px-3 py-2 text-xs space-y-1">
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Valor:</span>
                                  <span className="font-medium">R$ {fmtBRL(item.quality.valor)}</span>
                                  <CopyBtn value={String(item.quality.valor)} />
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="text-muted-foreground">Taxa:</span>
                                  <span>R$ {fmtBRL(item.quality.taxa)}</span>
                                  <CopyBtn value={String(item.quality.taxa)} />
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                {item.quality.cliente && (
                                  <span className="flex items-center gap-1">
                                    <span className="text-muted-foreground">Cliente:</span>
                                    <span>{item.quality.cliente}</span>
                                    <CopyBtn value={item.quality.cliente} />
                                  </span>
                                )}
                                {item.quality.nomePagador && (
                                  <span className="flex items-center gap-1">
                                    <span className="text-muted-foreground">Nome Pagador:</span>
                                    <span>{item.quality.nomePagador}</span>
                                    <CopyBtn value={item.quality.nomePagador} />
                                  </span>
                                )}
                              </div>
                              {item.dbTx && (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                  <span className="flex items-center gap-1">
                                    <span className="text-muted-foreground">Funcionário:</span>
                                    <span>{item.dbTx.nome_funcionario || '—'}</span>
                                    {item.dbTx.nome_funcionario && <CopyBtn value={item.dbTx.nome_funcionario} />}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {formatarDataHoraLiteral(item.dbTx.data_hora)}
                                    {' '}
                                    {item.dbTx.turno !== null && item.dbTx.turno !== 'outro_dia' && (
                                      <span className="ml-0.5 rounded bg-black/10 px-1 py-0.5 text-[10px] font-medium">
                                        {item.dbTx.turno === 'sem_turno' ? 'S/T' : `T${item.dbTx.turno}`}
                                      </span>
                                    )}
                                    {item.dbTx.turno === 'outro_dia' && (
                                      <span className="ml-0.5 text-muted-foreground">(outro dia)</span>
                                    )}
                                  </span>
                                </div>
                              )}
                              {item.notFound && (
                                <p className="text-orange-600 font-medium flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  não encontrada no extrato Mais Pagamentos
                                </p>
                              )}
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-muted-foreground">Doc. Ref.:</span>
                                <span className="font-mono text-[10px] break-all">{item.quality.docRef}</span>
                                <CopyBtn value={item.quality.docRef} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <p className="text-xs text-muted-foreground flex-1">
              Dica: Divergências geralmente são vendas na virada do turno — confira a hora da última venda.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: CNPJ diverge */}
      <AlertDialog open={!!cnpjMismatch} onOpenChange={() => setCnpjMismatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>CNPJ incompatível</AlertDialogTitle>
            <AlertDialogDescription>
              Este extrato pertence ao CNPJ <strong>{cnpjMismatch?.fileCnpj}</strong>, mas o posto selecionado é{' '}
              <strong>{cnpjMismatch?.postoNome}</strong> (CNPJ {cnpjMismatch?.postoCnpj}). Importação cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setCnpjMismatch(null)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: posto sem CNPJ — pedir confirmação */}
      <AlertDialog open={!!cnpjMissing} onOpenChange={() => setCnpjMissing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Posto sem CNPJ cadastrado</AlertDialogTitle>
            <AlertDialogDescription>
              O posto <strong>{cnpjMissing?.postoNome}</strong> não possui CNPJ cadastrado. Não é possível validar se
              este extrato pertence ao posto correto. Deseja importar mesmo assim?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCnpjMissing(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCnpjMissingConfirm}>Importar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog: confirmar exclusão de importação */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir importação?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo <strong>{deleteConfirm?.fileName}</strong> e suas{' '}
              <strong>{deleteConfirm?.totalTransacoes}</strong> transaç{deleteConfirm?.totalTransacoes === 1 ? 'ão' : 'ões'}{' '}
              e repasses associados serão removidos permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteImport}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
