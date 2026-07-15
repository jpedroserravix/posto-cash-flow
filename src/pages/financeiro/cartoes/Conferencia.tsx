import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useListaConfig } from '@/hooks/useListaConfig';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { FileCheck2, Plus, RefreshCw } from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface FechamentoTurno {
  id: string;
  numero_turno: number;
  hora_corte: string;
  total_calculado: number;
  status: 'pendente' | 'conferido' | 'divergente';
  observacao: string;
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

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y}`;
}

function fmtTime(t: string): string {
  if (!t) return '—';
  return t.substring(0, 5);
}

function nextDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('T')[0].split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 1);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function previousDay(isoDatetime: string): string {
  const [y, m, d] = isoDatetime.split('T')[0].split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

// Builds absolute ISO datetimes for each corte. When a corte's HH:MM ≤ previous,
// it crossed midnight — advance the date.
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
    if (prevMinutes >= 0 && totalMinutes <= prevMinutes) currentDate = nextDay(currentDate);
    prevMinutes = totalMinutes;
    result.push(`${currentDate}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`);
  }
  return result;
}

// ─── status badge (clickable to cycle) ───────────────────────────────────────

const STATUS_CYCLE: FechamentoTurno['status'][] = ['pendente', 'conferido', 'divergente'];
const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente', conferido: 'Conferido', divergente: 'Divergente',
};
const STATUS_CLASSES: Record<string, string> = {
  conferido:  'bg-green-600 hover:bg-green-600 text-white',
  pendente:   'bg-yellow-500 hover:bg-yellow-500 text-white',
  divergente: 'bg-red-500 hover:bg-red-500 text-white',
};

function StatusBadge({ status, onClick }: { status: string; onClick?: () => void }) {
  return (
    <Badge
      className={`${STATUS_CLASSES[status] ?? 'bg-gray-400 text-white'} text-[10px] whitespace-nowrap ${onClick ? 'cursor-pointer select-none' : ''}`}
      onClick={onClick}
      title={onClick ? 'Clique para alterar status' : undefined}
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ConferenciaCartoes() {
  const { selectedPostoId, postoId, postoNome, allPostos } = useAuth();
  const centrosCusto = useListaConfig('centros_custo', ['PISTA']);

  // ── posto local ────────────────────────────────────────────────────────────
  const [localPostoId, setLocalPostoId] = useState<string>('');
  useEffect(() => {
    const next = selectedPostoId ?? postoId ?? '';
    if (next) setLocalPostoId(next);
  }, [selectedPostoId, postoId]);

  const postoOptions = useMemo(
    () => allPostos.length > 0
      ? allPostos
      : postoId ? [{ id: postoId, nome: postoNome ?? 'Meu Posto', cnpj: '' }] : [],
    [allPostos, postoId, postoNome],
  );

  // ── adquirentes ────────────────────────────────────────────────────────────
  const [adquirentes, setAdquirentes] = useState<string[]>([]);
  const [adquirente, setAdquirente] = useState<string>('');

  useEffect(() => {
    (supabase as any)
      .from('cartoes_config_modalidades')
      .select('adquirente')
      .eq('ativo', true)
      .then(({ data }: any) => {
        const list = [...new Set(
          ((data || []) as { adquirente: string }[]).map((r) => r.adquirente),
        )].sort();
        setAdquirentes(list);
        setAdquirente((prev) => prev || list[0] || 'Premmia');
      });
  }, []);

  // ── fechamento state ────────────────────────────────────────────────────────
  const [fechamentoData, setFechamentoData] = useState<string>(
    () => new Date().toISOString().split('T')[0],
  );
  const [fechamentoCc,   setFechamentoCc]   = useState<string>('PISTA');
  const [cortes,         setCortes]         = useState<string[]>(['', '', '']);
  const [fechamentoTurnos, setFechamentoTurnos] = useState<FechamentoTurno[]>([]);
  const [turnosDirty,    setTurnosDirty]    = useState(false);
  const [semTurno,       setSemTurno]       = useState<{ count: number; valor: number } | null>(null);
  const [loadingFechamento, setLoadingFechamento] = useState(false);
  const [calculando,     setCalculando]     = useState(false);
  const [salvando,       setSalvando]       = useState(false);

  // ── load existing fechamento ──────────────────────────────────────────────
  const loadFechamento = useCallback(async () => {
    if (!localPostoId || !adquirente) return;
    setLoadingFechamento(true);

    const { data: fech } = await (supabase as any)
      .from('cartoes_fechamentos')
      .select('id, status')
      .eq('posto_id', localPostoId)
      .eq('data', fechamentoData)
      .eq('centro_custo', fechamentoCc)
      .eq('adquirente', adquirente)
      .maybeSingle();

    if (!fech) {
      setFechamentoTurnos([]);
      setSemTurno(null);
      setTurnosDirty(false);
      setLoadingFechamento(false);
      return;
    }

    const { data: turnos } = await (supabase as any)
      .from('cartoes_fechamentos_turnos')
      .select('id, numero_turno, hora_corte, total_calculado, status, observacao')
      .eq('fechamento_id', fech.id)
      .order('numero_turno', { ascending: true });

    const loaded: FechamentoTurno[] = (turnos || []).map((t: any) => ({
      id:              t.id,
      numero_turno:    t.numero_turno,
      hora_corte:      t.hora_corte,
      total_calculado: safeNum(t.total_calculado),
      status:          (t.status || 'pendente') as FechamentoTurno['status'],
      observacao:      t.observacao ?? '',
    }));

    setFechamentoTurnos(loaded);
    if (loaded.length > 0) setCortes(loaded.map((t) => t.hora_corte));
    setSemTurno(null);
    setTurnosDirty(false);
    setLoadingFechamento(false);
  }, [localPostoId, adquirente, fechamentoData, fechamentoCc]);

  useEffect(() => { loadFechamento(); }, [loadFechamento]);

  // ── calcular turnos ────────────────────────────────────────────────────────
  async function calcularTurnos() {
    if (!localPostoId || !adquirente || !fechamentoData) return;

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
      const absoluteCortes = buildAbsoluteCortes(fechamentoData, validCortes);
      const lastAbsoluteCorte = absoluteCortes[absoluteCortes.length - 1];

      // Check if previous day's last cut extends past midnight into this day
      const prevDate = previousDay(fechamentoData + 'T12:00:00');
      let queryStart = fechamentoData + 'T00:00:00';

      const { data: prevFech } = await (supabase as any)
        .from('cartoes_fechamentos')
        .select('id')
        .eq('posto_id', localPostoId)
        .eq('adquirente', adquirente)
        .eq('data', prevDate)
        .eq('centro_custo', fechamentoCc)
        .maybeSingle();

      if (prevFech) {
        const { data: prevTurnos } = await (supabase as any)
          .from('cartoes_fechamentos_turnos')
          .select('hora_corte, numero_turno')
          .eq('fechamento_id', prevFech.id)
          .order('numero_turno', { ascending: true });

        if (Array.isArray(prevTurnos) && prevTurnos.length > 0) {
          const prevCorteStrings = (prevTurnos as any[]).map((t: any) => t.hora_corte as string);
          const prevAbsoluteCortes = buildAbsoluteCortes(prevDate, prevCorteStrings);
          const prevLastCorte = prevAbsoluteCortes[prevAbsoluteCortes.length - 1];
          if (prevLastCorte > fechamentoData + 'T00:00:00') queryStart = prevLastCorte;
        }
      }

      // Fetch cartoes_vendas in the calculated window
      const { data: vendas, error } = await (supabase as any)
        .from('cartoes_vendas')
        .select('valor_bruto, data_transacao')
        .eq('posto_id', localPostoId)
        .eq('adquirente', adquirente)
        .gte('data_transacao', queryStart)
        .lte('data_transacao', lastAbsoluteCorte);

      if (error) throw new Error(error.message);

      // Distribute transactions per turn
      type TurnoKey = number | 'sem_turno';
      const groups = new Map<TurnoKey, { cents: number; count: number }>();

      for (const v of (vendas as any[] || [])) {
        const txDt = (v.data_transacao as string).replace(' ', 'T');
        const idx = absoluteCortes.findIndex((c) => txDt <= c);
        const key: TurnoKey = idx === -1 ? 'sem_turno' : idx + 1;
        const acc = groups.get(key) || { cents: 0, count: 0 };
        acc.cents += Math.round(safeNum(v.valor_bruto) * 100);
        acc.count++;
        groups.set(key, acc);
      }

      // Build result — preserve existing status/obs for matching turno numbers
      const result: FechamentoTurno[] = validCortes.map((corte, idx) => {
        const num = idx + 1;
        const g = groups.get(num) || { cents: 0, count: 0 };
        const existing = fechamentoTurnos.find((t) => t.numero_turno === num);
        return {
          id:              existing?.id ?? '',
          numero_turno:    num,
          hora_corte:      corte,
          total_calculado: g.cents / 100,
          status:          existing?.status ?? 'pendente',
          observacao:      existing?.observacao ?? '',
        };
      });
      result.sort((a, b) => a.numero_turno - b.numero_turno);

      setFechamentoTurnos(result);
      setTurnosDirty(true);

      const stAcc = groups.get('sem_turno');
      setSemTurno(
        stAcc && stAcc.count > 0 ? { count: stAcc.count, valor: stAcc.cents / 100 } : null,
      );

      if (result.length === 0) {
        toast.info('Nenhuma transação encontrada para essa data/adquirente.');
      } else {
        const totalBruto = result.reduce((s, t) => s + t.total_calculado, 0);
        toast.success(
          `${result.length} turno${result.length !== 1 ? 's' : ''} calculado${result.length !== 1 ? 's' : ''} — R$ ${fmtBRL(totalBruto)}`,
        );
      }
    } catch (err: unknown) {
      toast.error('Erro ao calcular: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCalculando(false);
    }
  }

  // ── salvar fechamento ──────────────────────────────────────────────────────
  async function salvarFechamento() {
    if (!localPostoId || !adquirente || fechamentoTurnos.length === 0) return;
    setSalvando(true);
    try {
      // Compute overall status from turns
      const allConferido  = fechamentoTurnos.every((t) => t.status === 'conferido');
      const anyDivergente = fechamentoTurnos.some((t) => t.status === 'divergente');
      const overallStatus = allConferido ? 'conferido' : anyDivergente ? 'divergente' : 'pendente';

      const { data: fech, error: fechError } = await (supabase as any)
        .from('cartoes_fechamentos')
        .upsert(
          {
            posto_id:     localPostoId,
            data:         fechamentoData,
            centro_custo: fechamentoCc,
            adquirente,
            status:       overallStatus,
          },
          { onConflict: 'posto_id,data,centro_custo,adquirente' },
        )
        .select('id')
        .single();
      if (fechError) throw new Error(fechError.message);
      const fechamentoId: string = fech.id;

      // Replace all turnos (delete + insert)
      await (supabase as any)
        .from('cartoes_fechamentos_turnos')
        .delete()
        .eq('fechamento_id', fechamentoId);

      const { error: insError } = await (supabase as any)
        .from('cartoes_fechamentos_turnos')
        .insert(
          fechamentoTurnos.map((t) => ({
            fechamento_id:   fechamentoId,
            numero_turno:    t.numero_turno,
            hora_corte:      t.hora_corte,
            total_calculado: t.total_calculado,
            status:          t.status,
            observacao:      t.observacao || null,
          })),
        );
      if (insError) throw new Error(insError.message);

      toast.success('Fechamento salvo!');
      setTurnosDirty(false);
      loadFechamento();
    } catch (err: unknown) {
      toast.error('Erro ao salvar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSalvando(false);
    }
  }

  // ── inline status toggle (click badge to cycle) ───────────────────────────
  function cycleStatus(idx: number) {
    setFechamentoTurnos((prev) => {
      const next = [...prev];
      const t = next[idx];
      const ci = STATUS_CYCLE.indexOf(t.status);
      next[idx] = { ...t, status: STATUS_CYCLE[(ci + 1) % STATUS_CYCLE.length] };
      return next;
    });
    setTurnosDirty(true);
  }

  function updateObs(idx: number, value: string) {
    setFechamentoTurnos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], observacao: value };
      return next;
    });
    setTurnosDirty(true);
  }

  // ── empty state ────────────────────────────────────────────────────────────
  if (!selectedPostoId && !postoId) {
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
      <div className="flex items-center gap-2">
        <FileCheck2 className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Conferência Cartões</h1>
      </div>

      {/* Panel */}
      <div className="rounded-md border p-4 space-y-5">

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {postoOptions.length > 1 ? (
            <Select value={localPostoId} onValueChange={setLocalPostoId}>
              <SelectTrigger className="h-9 w-[200px] text-sm">
                <SelectValue placeholder="Posto" />
              </SelectTrigger>
              <SelectContent>
                {postoOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : postoOptions.length === 1 ? (
            <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted/30 text-sm text-muted-foreground">
              {postoOptions[0].nome}
            </div>
          ) : null}

          {adquirentes.length > 1 ? (
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
          ) : (
            <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted/30 text-sm text-muted-foreground">
              {adquirente || 'Premmia'}
            </div>
          )}

          <input
            type="date"
            value={fechamentoData}
            onChange={(e) => setFechamentoData(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />

          <Select value={fechamentoCc} onValueChange={setFechamentoCc}>
            <SelectTrigger className="h-9 w-[140px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {centrosCusto.map((cc) => (
                <SelectItem key={cc} value={cc}>{cc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Two-column layout: cortes inputs | turn table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Left: cut-time inputs + actions */}
          <div className="space-y-3">
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

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 text-xs"
                disabled={calculando || salvando}
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

            {semTurno && semTurno.count > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950/20 dark:text-yellow-300">
                <span className="shrink-0">⚠</span>
                <span>
                  {semTurno.count} transaç{semTurno.count === 1 ? 'ão' : 'ões'} (R$ {fmtBRL(semTurno.valor)}) ficaram após o último corte e não foram atribuídas a nenhum turno.
                </span>
              </div>
            )}
          </div>

          {/* Right: turn table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs whitespace-nowrap">Turno</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Corte</TableHead>
                  <TableHead className="text-xs whitespace-nowrap text-right">Total (R$)</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingFechamento ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-6">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : fechamentoTurnos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-6">
                      {`Nenhum fechamento salvo para ${fmtDate(fechamentoData)}. Informe os horários e clique em Calcular Turnos.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  fechamentoTurnos.map((t, idx) => (
                    <TableRow key={t.id || t.numero_turno}>
                      <TableCell className="text-xs font-medium whitespace-nowrap">
                        Turno {t.numero_turno}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmtTime(t.hora_corte)}
                      </TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap font-medium">
                        {fmtBRL(t.total_calculado)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} onClick={() => cycleStatus(idx)} />
                      </TableCell>
                      <TableCell>
                        <input
                          type="text"
                          value={t.observacao}
                          onChange={(e) => updateObs(idx, e.target.value)}
                          placeholder="—"
                          className="h-7 w-full min-w-[120px] rounded border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {fechamentoTurnos.length > 0 && (
                  <TableRow className="border-t-2">
                    <TableCell className="text-xs font-semibold" colSpan={2}>Total</TableCell>
                    <TableCell className="text-xs font-semibold text-right whitespace-nowrap">
                      {fmtBRL(fechamentoTurnos.reduce((s, t) => s + t.total_calculado, 0))}
                    </TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
