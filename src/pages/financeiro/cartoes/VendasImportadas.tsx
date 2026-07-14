import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useDateFilter } from '@/hooks/useDateFilter';
import { DateFilter } from '@/components/DateFilter';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { FileSpreadsheet, ChevronDown, ChevronRight, Trash2, AlertTriangle } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateGroup(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return `${days[date.getDay()]}, ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function fmtDatetime(iso: string): string {
  if (!iso) return '—';
  const [datePart, timePart] = iso.split('T');
  const [y, m, d] = datePart.split('-');
  const time = (timePart ?? '').replace(/(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/, '').substring(0, 5);
  return `${d}/${m}/${y} ${time}`;
}

function safeNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

function truncateCodigo(code: string): string {
  return code.length > 12 ? code.substring(0, 12) + '…' : code;
}

// ─── Checkbox com suporte a estado indeterminado ──────────────────────────────

function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  onClick,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      className="h-4 w-4 cursor-pointer rounded border-gray-400 accent-primary"
    />
  );
}

// ─── types ───────────────────────────────────────────────────────────────────

interface Venda {
  id: string;
  posto_id: string;
  adquirente: string;
  cpf: string | null;
  nome: string | null;
  produto: string | null;
  valor_bruto: number;
  data_transacao: string;
  codigo_transacao: string;
  forma_pagamento: string | null;
  status: string | null;
  created_at: string;
}

interface GrupoVendas {
  date: string;
  count: number;
  total_bruto: number;
  items: Venda[];
}

// ─── component ───────────────────────────────────────────────────────────────

export default function VendasImportadas() {
  const { selectedPostoId, postoId, postoNome, allPostos, hasPermission } = useAuth();
  const { preset: dfPreset, range: dfRange, setPreset: setDfPreset } = useDateFilter('thisMonth');

  const [localPostoId, setLocalPostoId] = useState<string>('');
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(false);

  const [filtroAdquirente, setFiltroAdquirente] = useState('');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletando, setDeletando] = useState(false);

  const podeExcluir = hasPermission('cartoes-excluir');

  const postoOptions = useMemo(
    () =>
      allPostos.length > 0
        ? allPostos
        : postoId
        ? [{ id: postoId, nome: postoNome ?? 'Meu Posto', cnpj: '' }]
        : [],
    [allPostos, postoId, postoNome],
  );

  useEffect(() => {
    const next = selectedPostoId ?? postoId ?? '';
    if (next) setLocalPostoId(next);
  }, [selectedPostoId, postoId]);

  // ── load ─────────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!localPostoId) return;
    setLoading(true);
    setSelectedIds(new Set());
    try {
      const { data, error } = await (supabase as any)
        .from('cartoes_vendas')
        .select(
          'id, posto_id, adquirente, cpf, nome, produto, valor_bruto, data_transacao, codigo_transacao, forma_pagamento, status, created_at',
        )
        .eq('posto_id', localPostoId)
        .gte('data_transacao', `${dfRange.start}T00:00:00`)
        .lte('data_transacao', `${dfRange.end}T23:59:59`)
        .order('data_transacao', { ascending: false });

      if (error) { toast.error('Erro ao carregar vendas: ' + error.message); return; }

      setVendas(
        ((data as any[]) || []).map((r: any) => ({
          id:               r.id,
          posto_id:         r.posto_id,
          adquirente:       r.adquirente,
          cpf:              r.cpf ?? null,
          nome:             r.nome ?? null,
          produto:          r.produto ?? null,
          valor_bruto:      safeNum(r.valor_bruto),
          data_transacao:   r.data_transacao,
          codigo_transacao: r.codigo_transacao,
          forma_pagamento:  r.forma_pagamento ?? null,
          status:           r.status ?? null,
          created_at:       r.created_at,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [localPostoId, dfRange.start, dfRange.end]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── derived ───────────────────────────────────────────────────────────────────

  const uniqueAdquirentes = useMemo(
    () => [...new Set(vendas.map((v) => v.adquirente).filter(Boolean))].sort(),
    [vendas],
  );

  const filteredVendas = useMemo(
    () => filtroAdquirente ? vendas.filter((v) => v.adquirente === filtroAdquirente) : vendas,
    [vendas, filtroAdquirente],
  );

  const grupos = useMemo<GrupoVendas[]>(() => {
    const byDate = new Map<string, Venda[]>();
    for (const v of filteredVendas) {
      const key = v.data_transacao.split('T')[0];
      const arr = byDate.get(key) ?? [];
      arr.push(v);
      byDate.set(key, arr);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, items]) => ({
        date,
        count: items.length,
        total_bruto: items.reduce((s, v) => s + v.valor_bruto, 0),
        items,
      }));
  }, [filteredVendas]);

  const selectedVendas = useMemo(
    () => filteredVendas.filter((v) => selectedIds.has(v.id)),
    [filteredVendas, selectedIds],
  );

  const deleteTotal = useMemo(
    () => selectedVendas.reduce((s, v) => s + v.valor_bruto, 0),
    [selectedVendas],
  );

  // ── selection ────────────────────────────────────────────────────────────────

  function toggleGroup(grupo: GrupoVendas) {
    const allSel = grupo.items.every((v) => selectedIds.has(v.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSel) {
        grupo.items.forEach((v) => next.delete(v.id));
      } else {
        grupo.items.forEach((v) => next.add(v.id));
      }
      return next;
    });
  }

  function toggleItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ── expand ───────────────────────────────────────────────────────────────────

  function toggleDate(date: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  }

  // ── delete ───────────────────────────────────────────────────────────────────

  async function handleDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setDeletando(true);
    try {
      const { error } = await (supabase as any)
        .from('cartoes_vendas')
        .delete()
        .in('id', ids);
      if (error) throw new Error(error.message);
      toast.success(`${ids.length} venda${ids.length !== 1 ? 's' : ''} excluída${ids.length !== 1 ? 's' : ''}. Os recebíveis foram removidos automaticamente.`);
      setShowDeleteDialog(false);
      setSelectedIds(new Set());
      loadData();
    } catch (err: unknown) {
      toast.error('Erro: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletando(false);
    }
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Vendas Importadas</h1>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Posto */}
        {postoOptions.length > 1 ? (
          <Select value={localPostoId} onValueChange={setLocalPostoId}>
            <SelectTrigger className="h-9 w-[180px] text-sm">
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

        {/* Adquirente */}
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
      </div>

      {/* Filtro de período */}
      <DateFilter preset={dfPreset} range={dfRange} onChange={setDfPreset} />

      {/* Barra de ação (seleção ativa) */}
      {podeExcluir && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20 px-4 py-2.5">
          <span className="flex-1 text-sm font-medium text-red-800 dark:text-red-300">
            {selectedIds.size} venda{selectedIds.size !== 1 ? 's' : ''} selecionada{selectedIds.size !== 1 ? 's' : ''}
            {' '}· R$ {fmtBRL(deleteTotal)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={clearSelection}
          >
            Limpar
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir selecionadas
          </Button>
        </div>
      )}

      {/* Lista */}
      {!localPostoId ? (
        <p className="text-muted-foreground text-center py-8">
          Selecione um posto para continuar.
        </p>
      ) : loading ? (
        <p className="text-center text-muted-foreground text-sm py-10">Carregando...</p>
      ) : grupos.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm py-10">
          Nenhuma venda importada no período selecionado.
        </p>
      ) : (
        <div className="space-y-2">
          {grupos.map((grupo) => {
            const isExpanded = expandedDates.has(grupo.date);
            const allSel  = grupo.items.every((v) => selectedIds.has(v.id));
            const someSel = grupo.items.some((v) => selectedIds.has(v.id));

            return (
              <div key={grupo.date} className="rounded-md border">
                {/* Cabeçalho do grupo */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors select-none"
                  onClick={() => toggleDate(grupo.date)}
                >
                  {/* Checkbox de grupo */}
                  {podeExcluir && (
                    <IndeterminateCheckbox
                      checked={allSel}
                      indeterminate={someSel && !allSel}
                      onChange={() => toggleGroup(grupo)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}

                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}

                  <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold whitespace-nowrap">
                      {fmtDateGroup(grupo.date)}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {grupo.count} transaç{grupo.count !== 1 ? 'ões' : 'ão'}
                    </span>
                  </div>

                  <span className="text-sm font-bold tabular-nums whitespace-nowrap shrink-0">
                    R$ {fmtBRL(grupo.total_bruto)}
                  </span>
                </div>

                {/* Tabela de transações */}
                {isExpanded && (
                  <div className="border-t overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {podeExcluir && <TableHead className="w-10 text-xs" />}
                          <TableHead className="text-xs whitespace-nowrap">Nome</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">CPF</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Forma Pgto.</TableHead>
                          <TableHead className="text-xs text-right whitespace-nowrap">Valor (R$)</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Data/Hora</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Código</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grupo.items.map((v) => {
                          const isSel = selectedIds.has(v.id);
                          return (
                            <TableRow
                              key={v.id}
                              className={isSel ? 'bg-red-50/60 dark:bg-red-950/10' : ''}
                            >
                              {podeExcluir && (
                                <TableCell className="py-2 pl-4">
                                  <input
                                    type="checkbox"
                                    checked={isSel}
                                    onChange={() => toggleItem(v.id)}
                                    className="h-4 w-4 cursor-pointer rounded border-gray-400 accent-primary"
                                  />
                                </TableCell>
                              )}
                              <TableCell className="text-xs whitespace-nowrap py-2 max-w-[160px] truncate">
                                {v.nome || '—'}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap py-2">
                                {v.cpf || '—'}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap py-2">
                                {v.forma_pagamento || '—'}
                              </TableCell>
                              <TableCell className="text-xs text-right whitespace-nowrap py-2 tabular-nums font-medium">
                                {fmtBRL(v.valor_bruto)}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap py-2 text-muted-foreground">
                                {fmtDatetime(v.data_transacao)}
                              </TableCell>
                              <TableCell className="text-xs whitespace-nowrap py-2 font-mono text-muted-foreground">
                                {truncateCodigo(v.codigo_transacao)}
                              </TableCell>
                            </TableRow>
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

      {/* Dialog de confirmação de exclusão */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => { if (!open && !deletando) setShowDeleteDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              Confirmar exclusão
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                <p className="text-sm">
                  Você está prestes a excluir{' '}
                  <strong>{selectedIds.size} transaç{selectedIds.size !== 1 ? 'ões' : 'ão'}</strong>{' '}
                  com total de{' '}
                  <strong>R$ {fmtBRL(deleteTotal)}</strong>.
                </p>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                  Os recebíveis correspondentes também serão excluídos automaticamente. Esta ação não pode ser desfeita.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deletando}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={deletando}
            >
              {deletando ? 'Excluindo...' : `Excluir ${selectedIds.size} venda${selectedIds.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
