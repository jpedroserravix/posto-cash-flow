import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDateFilter } from '@/hooks/useDateFilter';
import { DateFilter } from '@/components/DateFilter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Wallet, ChevronDown, ChevronRight, Check, Clock, AlertTriangle, Undo2,
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = getToday();

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateGroup(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return `${days[date.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function safeNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function sumLiq(items: Recebivel[]): number {
  return items.reduce((s, r) => s + r.valor_liquido, 0);
}

// ─── types ───────────────────────────────────────────────────────────────────

interface RecebivelVenda {
  nome: string | null;
  cpf: string | null;
  codigo_transacao: string;
}

interface Recebivel {
  id: string;
  venda_id: string;
  posto_id: string;
  adquirente: string;
  modalidade: string;
  condicao_recebimento: string;
  data_transacao: string;
  valor_bruto: number;
  taxa_pct: number;
  valor_desconto: number;
  valor_liquido: number;
  data_prevista_credito: string;
  status_recebimento: 'pendente' | 'recebido';
  data_recebimento_real: string | null;
  cartoes_vendas?: RecebivelVenda | null;
}

interface GrupoModalidade {
  key: string;
  modalidade: string;
  condicao_recebimento: string;
  count: number;
  total_bruto: number;
  total_desconto: number;
  total_liquido: number;
  items: Recebivel[];
}

interface GrupoData {
  data_prevista_credito: string;
  isAtrasado: boolean;
  allRecebido: boolean;
  hasPendente: boolean;
  total_bruto: number;
  total_desconto: number;
  total_liquido: number;
  count: number;
  pendentes: Recebivel[];
  recebidos: Recebivel[];
  modalidades: GrupoModalidade[];
}

// ─── component ───────────────────────────────────────────────────────────────

export default function CartoesAReceber() {
  const { selectedPostoId } = useAuth();
  const { preset: dfPreset, range: dfRange, setPreset: setDfPreset } = useDateFilter('thisMonth');

  const [recebiveis, setRecebiveis] = useState<Recebivel[]>([]);
  const [loading, setLoading] = useState(false);

  const [filtroAdquirente, setFiltroAdquirente] = useState('');
  const [filtroModalidade, setFiltroModalidade] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedMods, setExpandedMods] = useState<Set<string>>(new Set());

  const [marcarDialog, setMarcarDialog] = useState<{ items: Recebivel[]; dataGrupo: string } | null>(null);
  const [dataRecebimento, setDataRecebimento] = useState<string>(TODAY);
  const [salvando, setSalvando] = useState(false);

  // ── load ────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!selectedPostoId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('cartoes_recebiveis')
        .select(
          `id, venda_id, posto_id, adquirente, modalidade, condicao_recebimento,
           data_transacao, valor_bruto, taxa_pct, valor_desconto, valor_liquido,
           data_prevista_credito, status_recebimento, data_recebimento_real,
           cartoes_vendas(nome, cpf, codigo_transacao)`,
        )
        .eq('posto_id', selectedPostoId)
        .gte('data_prevista_credito', dfRange.start)
        .lte('data_prevista_credito', dfRange.end)
        .order('data_prevista_credito', { ascending: true });

      if (error) {
        toast.error('Erro ao carregar recebíveis: ' + error.message);
        return;
      }

      setRecebiveis(
        ((data as any[]) || []).map((r: any) => ({
          id:                    r.id,
          venda_id:              r.venda_id,
          posto_id:              r.posto_id,
          adquirente:            r.adquirente,
          modalidade:            r.modalidade,
          condicao_recebimento:  r.condicao_recebimento,
          data_transacao:        r.data_transacao,
          valor_bruto:           safeNum(r.valor_bruto),
          taxa_pct:              safeNum(r.taxa_pct),
          valor_desconto:        safeNum(r.valor_desconto),
          valor_liquido:         safeNum(r.valor_liquido),
          data_prevista_credito: r.data_prevista_credito,
          status_recebimento:    r.status_recebimento,
          data_recebimento_real: r.data_recebimento_real ?? null,
          cartoes_vendas:        r.cartoes_vendas ?? null,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [selectedPostoId, dfRange.start, dfRange.end]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── derived data ─────────────────────────────────────────────────────────────

  const uniqueAdquirentes = useMemo(
    () => [...new Set(recebiveis.map((r) => r.adquirente))].sort(),
    [recebiveis],
  );

  const uniqueModalidades = useMemo(
    () => [...new Set(recebiveis.map((r) => r.modalidade))].sort(),
    [recebiveis],
  );

  const totalPendente = useMemo(
    () => recebiveis.filter((r) => r.status_recebimento === 'pendente').reduce((s, r) => s + r.valor_liquido, 0),
    [recebiveis],
  );

  const totalHoje = useMemo(
    () => recebiveis
      .filter((r) => r.status_recebimento === 'pendente' && r.data_prevista_credito === TODAY)
      .reduce((s, r) => s + r.valor_liquido, 0),
    [recebiveis],
  );

  const totalAtrasado = useMemo(
    () => recebiveis
      .filter((r) => r.status_recebimento === 'pendente' && r.data_prevista_credito < TODAY)
      .reduce((s, r) => s + r.valor_liquido, 0),
    [recebiveis],
  );

  const grupos = useMemo<GrupoData[]>(() => {
    let filtered = recebiveis;
    if (filtroAdquirente) filtered = filtered.filter((r) => r.adquirente === filtroAdquirente);
    if (filtroModalidade) filtered = filtered.filter((r) => r.modalidade === filtroModalidade);
    if (filtroStatus) filtered = filtered.filter((r) => r.status_recebimento === filtroStatus);

    const byDate = new Map<string, Recebivel[]>();
    for (const r of filtered) {
      const arr = byDate.get(r.data_prevista_credito) ?? [];
      arr.push(r);
      byDate.set(r.data_prevista_credito, arr);
    }

    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => {
        const pendentes = items.filter((r) => r.status_recebimento === 'pendente');
        const recebidos = items.filter((r) => r.status_recebimento === 'recebido');

        const byMod = new Map<string, Recebivel[]>();
        for (const r of items) {
          const key = `${date}|${r.modalidade}|${r.condicao_recebimento}`;
          const arr = byMod.get(key) ?? [];
          arr.push(r);
          byMod.set(key, arr);
        }

        const modalidades: GrupoModalidade[] = [...byMod.entries()].map(([key, modItems]) => {
          const parts = key.split('|');
          return {
            key,
            modalidade:           parts[1],
            condicao_recebimento: parts[2],
            count:         modItems.length,
            total_bruto:   modItems.reduce((s, r) => s + r.valor_bruto, 0),
            total_desconto: modItems.reduce((s, r) => s + r.valor_desconto, 0),
            total_liquido: modItems.reduce((s, r) => s + r.valor_liquido, 0),
            items: modItems,
          };
        });

        return {
          data_prevista_credito: date,
          isAtrasado:  pendentes.length > 0 && date < TODAY,
          allRecebido: items.length > 0 && recebidos.length === items.length,
          hasPendente: pendentes.length > 0,
          total_bruto:    items.reduce((s, r) => s + r.valor_bruto, 0),
          total_desconto: items.reduce((s, r) => s + r.valor_desconto, 0),
          total_liquido:  sumLiq(items),
          count: items.length,
          pendentes,
          recebidos,
          modalidades,
        };
      });
  }, [recebiveis, filtroAdquirente, filtroModalidade, filtroStatus]);

  // ── expand toggles ────────────────────────────────────────────────────────────

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  function toggleMod(key: string) {
    setExpandedMods((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // ── actions ──────────────────────────────────────────────────────────────────

  async function confirmarMarcar() {
    if (!marcarDialog || salvando) return;
    const ids = marcarDialog.items.map((r) => r.id);
    setSalvando(true);
    try {
      const { error } = await (supabase as any)
        .from('cartoes_recebiveis')
        .update({ status_recebimento: 'recebido', data_recebimento_real: dataRecebimento })
        .in('id', ids);
      if (error) throw new Error(error.message);
      toast.success(`${ids.length} recebível${ids.length !== 1 ? 'is' : ''} marcado${ids.length !== 1 ? 's' : ''} como recebido.`);
      setMarcarDialog(null);
      loadData();
    } catch (err: unknown) {
      toast.error('Erro: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSalvando(false);
    }
  }

  async function handleDesfazer(grupo: GrupoData) {
    const ids = grupo.recebidos.map((r) => r.id);
    if (ids.length === 0) return;
    try {
      const { error } = await (supabase as any)
        .from('cartoes_recebiveis')
        .update({ status_recebimento: 'pendente', data_recebimento_real: null })
        .in('id', ids);
      if (error) throw new Error(error.message);
      toast.success('Recebimento desfeito.');
      loadData();
    } catch (err: unknown) {
      toast.error('Erro: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  // ── empty state ───────────────────────────────────────────────────────────────

  if (!selectedPostoId) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Selecione um posto para continuar.
      </p>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wallet className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Cartões a Receber</h1>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10 shrink-0">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total Pendente</p>
                <p className="text-lg font-bold leading-tight">R$ {fmtBRL(totalPendente)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600/10 shrink-0">
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Recebendo Hoje</p>
                <p className="text-lg font-bold leading-tight">R$ {fmtBRL(totalHoje)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Atrasados</p>
                <p className="text-lg font-bold leading-tight">R$ {fmtBRL(totalAtrasado)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {uniqueAdquirentes.length > 1 && (
          <Select
            value={filtroAdquirente || '__all__'}
            onValueChange={(v) => setFiltroAdquirente(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <SelectValue placeholder="Adquirente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos adquirentes</SelectItem>
              {uniqueAdquirentes.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {uniqueModalidades.length > 1 && (
          <Select
            value={filtroModalidade || '__all__'}
            onValueChange={(v) => setFiltroModalidade(v === '__all__' ? '' : v)}
          >
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <SelectValue placeholder="Modalidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas modalidades</SelectItem>
              {uniqueModalidades.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select
          value={filtroStatus || '__all__'}
          onValueChange={(v) => setFiltroStatus(v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="h-9 w-[140px] text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="recebido">Recebido</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filtro de período */}
      <DateFilter preset={dfPreset} range={dfRange} onChange={setDfPreset} />

      {/* Lista agrupada por data */}
      {loading ? (
        <p className="text-center text-muted-foreground text-sm py-10">Carregando...</p>
      ) : grupos.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-10">
          Nenhum recebível no período selecionado.
        </p>
      ) : (
        <div className="space-y-2">
          {grupos.map((grupo) => {
            const isExpanded = expandedDates.has(grupo.data_prevista_credito);
            const isHoje = grupo.data_prevista_credito === TODAY;

            const badgeClass = grupo.isAtrasado
              ? 'bg-red-500 hover:bg-red-500 text-white'
              : grupo.allRecebido
              ? 'bg-green-600 hover:bg-green-600 text-white'
              : isHoje
              ? 'bg-blue-500 hover:bg-blue-500 text-white'
              : 'bg-yellow-500 hover:bg-yellow-500 text-white';

            const badgeLabel = grupo.isAtrasado
              ? 'Atrasado'
              : grupo.allRecebido
              ? 'Recebido'
              : isHoje
              ? 'Hoje'
              : 'Pendente';

            return (
              <div key={grupo.data_prevista_credito} className="rounded-md border">
                {/* Cabeçalho do grupo */}
                <div
                  className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors select-none"
                  onClick={() => toggleDate(grupo.data_prevista_credito)}
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}

                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold whitespace-nowrap">
                      {fmtDateGroup(grupo.data_prevista_credito)}
                    </span>
                    <Badge className={`${badgeClass} text-[10px] whitespace-nowrap px-1.5 py-0`}>
                      {badgeLabel}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {grupo.count} transaç{grupo.count !== 1 ? 'ões' : 'ão'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <div className="hidden sm:block text-right">
                      <p className="text-xs text-muted-foreground leading-none">Líquido</p>
                      <p className="text-sm font-bold tabular-nums">R$ {fmtBRL(grupo.total_liquido)}</p>
                    </div>

                    {grupo.hasPendente && (
                      <Button
                        size="sm"
                        className="h-7 gap-1 text-xs whitespace-nowrap"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDataRecebimento(TODAY);
                          setMarcarDialog({
                            items: grupo.pendentes,
                            dataGrupo: grupo.data_prevista_credito,
                          });
                        }}
                      >
                        <Check className="w-3 h-3" />
                        <span className="hidden xs:inline">Marcar recebido</span>
                        <span className="xs:hidden">Receber</span>
                      </Button>
                    )}

                    {grupo.allRecebido && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-xs whitespace-nowrap"
                        onClick={(e) => { e.stopPropagation(); handleDesfazer(grupo); }}
                      >
                        <Undo2 className="w-3 h-3" />
                        Desfazer
                      </Button>
                    )}
                  </div>
                </div>

                {/* Tabela de modalidades (expandida) */}
                {isExpanded && (
                  <div className="border-t overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-6 text-xs" />
                          <TableHead className="text-xs whitespace-nowrap">Modalidade</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Condição</TableHead>
                          <TableHead className="text-xs text-right whitespace-nowrap">Qtd.</TableHead>
                          <TableHead className="text-xs text-right whitespace-nowrap">Bruto (R$)</TableHead>
                          <TableHead className="text-xs text-right whitespace-nowrap">Desconto (R$)</TableHead>
                          <TableHead className="text-xs text-right whitespace-nowrap">Líquido (R$)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grupo.modalidades.map((mod) => {
                          const modExpanded = expandedMods.has(mod.key);
                          return (
                            <React.Fragment key={mod.key}>
                              <TableRow
                                className="cursor-pointer hover:bg-muted/30"
                                onClick={() => toggleMod(mod.key)}
                              >
                                <TableCell className="py-2 pl-4">
                                  {modExpanded
                                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                                </TableCell>
                                <TableCell className="text-xs font-medium whitespace-nowrap py-2">
                                  {mod.modalidade}
                                </TableCell>
                                <TableCell className="text-xs whitespace-nowrap py-2 text-muted-foreground">
                                  {mod.condicao_recebimento}
                                </TableCell>
                                <TableCell className="text-xs text-right whitespace-nowrap py-2 tabular-nums">
                                  {mod.count}
                                </TableCell>
                                <TableCell className="text-xs text-right whitespace-nowrap py-2 tabular-nums">
                                  {fmtBRL(mod.total_bruto)}
                                </TableCell>
                                <TableCell className="text-xs text-right whitespace-nowrap py-2 tabular-nums text-red-500">
                                  {fmtBRL(mod.total_desconto)}
                                </TableCell>
                                <TableCell className="text-xs text-right whitespace-nowrap py-2 tabular-nums font-semibold">
                                  {fmtBRL(mod.total_liquido)}
                                </TableCell>
                              </TableRow>

                              {/* Transações individuais */}
                              {modExpanded && mod.items.map((r) => (
                                <TableRow key={r.id} className="bg-muted/20 hover:bg-muted/30">
                                  <TableCell className="py-1.5" />
                                  <TableCell colSpan={2} className="text-xs py-1.5 pl-8">
                                    <div>
                                      <span className="font-medium">
                                        {r.cartoes_vendas?.nome || '—'}
                                      </span>
                                      {r.cartoes_vendas?.cpf && (
                                        <span className="text-muted-foreground ml-2">
                                          {r.cartoes_vendas.cpf}
                                        </span>
                                      )}
                                    </div>
                                    {r.cartoes_vendas?.codigo_transacao && (
                                      <div className="text-[10px] text-muted-foreground font-mono">
                                        {r.cartoes_vendas.codigo_transacao}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-right py-1.5 text-muted-foreground tabular-nums whitespace-nowrap">
                                    {fmtDate(r.data_transacao)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right py-1.5 tabular-nums whitespace-nowrap">
                                    {fmtBRL(r.valor_bruto)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right py-1.5 tabular-nums text-red-400 whitespace-nowrap">
                                    {fmtBRL(r.valor_desconto)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right py-1.5 tabular-nums font-medium whitespace-nowrap">
                                    {fmtBRL(r.valor_liquido)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog: confirmar recebimento */}
      <Dialog open={!!marcarDialog} onOpenChange={(open) => { if (!open) setMarcarDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar recebimento</DialogTitle>
            {marcarDialog && (
              <DialogDescription>
                Marcar{' '}
                <strong>
                  {marcarDialog.items.length} recebível{marcarDialog.items.length !== 1 ? 'is' : ''}
                </strong>{' '}
                de{' '}
                <strong>{fmtDateGroup(marcarDialog.dataGrupo)}</strong>{' '}
                como recebidos?
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs">Data de recebimento</Label>
            <input
              type="date"
              value={dataRecebimento}
              onChange={(e) => setDataRecebimento(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMarcarDialog(null)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={confirmarMarcar}
              disabled={salvando || !dataRecebimento}
            >
              {salvando ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
