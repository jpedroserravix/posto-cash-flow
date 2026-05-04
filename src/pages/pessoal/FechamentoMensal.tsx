import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from '@/components/PaginationControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, Lock, Unlock, Download } from 'lucide-react';

// ─── types ──────────────────────────────────────────────────────────────────

interface Funcionario {
  id: string;
  nome: string;
  cargo: string;
  status: 'ativo' | 'desligado';
  // jornada
  escala_trabalho?: string | null;
  horario_entrada?: string | null;
  horario_saida?: string | null;
  adicional_noturno?: boolean | null;
  horas_extras_fixas_mes?: number | null;
}

interface OcorrenciaStats {
  funcionario_id: string;
  faltas: number;
  faltas_justificadas: number;
  atrasos: number;
  horas_extra: number;
  atestados: number;
  advertencias: number;
  suspensoes: number;
  auto_descontos: number;        // Vale Funcionário + Dano/Prejuízo
  auto_vale_quinzenal: number;   // Vale Quinzenal — coluna própria, read-only
  auto_quebra_desc: number;      // Desconto Quebra de Caixa — coluna própria, read-only
  auto_quebra_credito: number;   // Quebra de Caixa (Crédito) — read-only display
}

interface Fechamento {
  id: string;
  funcionario_id: string;
  posto_id: string;
  mes: number;
  ano: number;
  faltas: number;
  atrasos: number;
  horas_extra: number;
  atestados: number;
  advertencias: number;
  suspensoes: number;
  premiacao: number;
  descontos: number;
  vale_transporte: number;
  quebra_caixa: number;
  observacoes: string | null;
  fechado: boolean;
  created_at: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function formatBRL(val: number | string) {
  const n = typeof val === 'string' ? parseFloat(val) || 0 : (val ?? 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function negBRL(val: number | string) {
  // Guard: Supabase may return numeric columns as strings (e.g. "652.0000000000")
  const n = typeof val === 'string' ? parseFloat(val) || 0 : (val ?? 0);
  return n > 0 ? `-${formatBRL(n)}` : formatBRL(n);
}

// ─── edit row state per employee ─────────────────────────────────────────────
// Premiação e Vale Transporte foram removidos da UI (mantidos no DB com valor 0 para compat.)

interface EditRow {
  observacoes: string;
}

const EMPTY_EDIT: EditRow = { observacoes: '' };

// ─── column keys for visibility toggle ───────────────────────────────────────

const COL_KEYS = ['escala', 'horario', 'adicNoturno', 'hExtraFixas', 'faltas', 'faltasJust', 'atrasos', 'horasExtra', 'advertencias', 'suspensoes'] as const;
type ColKey = typeof COL_KEYS[number];

const COL_LABELS: Record<ColKey, string> = {
  escala: 'Escala',
  horario: 'Horário',
  adicNoturno: 'Ad. Noturno',
  hExtraFixas: 'H. Extra Fixas',
  faltas: 'Faltas',
  faltasJust: 'Faltas Just.',
  atrasos: 'Atrasos',
  horasExtra: 'H. Extra',
  advertencias: 'Advert.',
  suspensoes: 'Susp.',
};

// ─── main component ─────────────────────────────────────────────────────────

export default function FechamentoMensal() {
  const { selectedPostoId, allPostos } = useAuth();

  const showPostoSelector = allPostos.length > 0;
  const [localPostoId, setLocalPostoId] = useState<string>(selectedPostoId ?? '');
  useEffect(() => { if (selectedPostoId) setLocalPostoId(selectedPostoId); }, [selectedPostoId]);
  const postoId = showPostoSelector ? localPostoId : (selectedPostoId ?? '');

  const now = new Date();
  const [filterMes, setFilterMes] = useState(String(now.getMonth() + 1));
  const [filterAno, setFilterAno] = useState(String(now.getFullYear()));
  const [filterFunc, setFilterFunc] = useState('__all__');
  const [showCols, setShowCols] = useState<Record<ColKey, boolean>>({
    escala: false, horario: false, adicNoturno: false, hExtraFixas: true,
    faltas: true, faltasJust: true, atrasos: true, horasExtra: true, advertencias: true, suspensoes: true,
  });

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [stats, setStats] = useState<OcorrenciaStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [editRows, setEditRows] = useState<Record<string, EditRow>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // ─── load ──────────────────────────────────────────────────────────────────

  async function loadFuncionarios() {
    if (!postoId) return;
    const { data } = await (supabase as any)
      .from('pessoal_funcionarios')
      .select('id, nome, cargo, status, escala_trabalho, horario_entrada, horario_saida, adicional_noturno, horas_extras_fixas_mes')
      .eq('posto_id', postoId)
      .order('nome');
    setFuncionarios(data ?? []);
  }

  async function load() {
    if (!postoId) return;
    setLoading(true);
    const mes = Number(filterMes);
    const ano = Number(filterAno);

    const startDate = `${filterAno}-${String(mes).padStart(2, '0')}-01`;
    const lastDay = new Date(ano, mes, 0).getDate();
    const endDate = `${filterAno}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [{ data: ocData }, { data: fechData }] = await Promise.all([
      (supabase as any)
        .from('pessoal_ocorrencias')
        .select('funcionario_id, tipo, horas, valor')
        .eq('posto_id', postoId)
        .gte('data', startDate)
        .lte('data', endDate),
      (supabase as any)
        .from('pessoal_fechamentos')
        .select('*')
        .eq('posto_id', postoId)
        .eq('mes', mes)
        .eq('ano', ano),
    ]);

    // aggregate ocorrencias into stats
    const statsMap: Record<string, OcorrenciaStats> = {};
    (ocData ?? []).forEach((o: any) => {
      if (!statsMap[o.funcionario_id]) {
        statsMap[o.funcionario_id] = {
          funcionario_id: o.funcionario_id,
          faltas: 0, faltas_justificadas: 0, atrasos: 0, horas_extra: 0, atestados: 0, advertencias: 0, suspensoes: 0,
          auto_descontos: 0, auto_vale_quinzenal: 0, auto_quebra_desc: 0, auto_quebra_credito: 0,
        };
      }
      const s = statsMap[o.funcionario_id];
      // Use parseFloat to guard against Supabase returning numeric as string (e.g. "755.0000000000")
      if (o.tipo === 'Falta') s.faltas += 1;
      else if (o.tipo === 'Falta Justificada') s.faltas_justificadas += 1;
      else if (o.tipo === 'Atraso') s.atrasos += parseFloat(o.horas) || 0;
      else if (o.tipo === 'Hora Extra') s.horas_extra += parseFloat(o.horas) || 0;
      else if (o.tipo === 'Atestado') s.atestados += 1;
      else if (o.tipo === 'Advertência') s.advertencias += 1;
      else if (o.tipo === 'Suspensão') s.suspensoes += 1;
      else if (o.tipo === 'Vale Quinzenal') s.auto_vale_quinzenal += parseFloat(o.valor) || 0;
      else if (o.tipo === 'Vale Funcionário' || o.tipo === 'Dano/Prejuízo') s.auto_descontos += parseFloat(o.valor) || 0;
      else if (o.tipo === 'Desconto Quebra de Caixa') s.auto_quebra_desc += parseFloat(o.valor) || 0;
      else if (o.tipo === 'Quebra de Caixa (Crédito)') s.auto_quebra_credito += parseFloat(o.valor) || 0;
    });

    setStats(Object.values(statsMap));
    setFechamentos(fechData ?? []);

    // init editRows: saved fechamentos take priority
    const newEditRows: Record<string, EditRow> = {};
    (fechData ?? []).forEach((f: Fechamento) => {
      newEditRows[f.funcionario_id] = {
        observacoes: f.observacoes ?? '',
      };
    });
    // Pre-fill for employees without a fechamento
    Object.values(statsMap).forEach((s) => {
      if (!newEditRows[s.funcionario_id]) {
        newEditRows[s.funcionario_id] = { observacoes: '' };
      }
    });
    setEditRows(newEditRows);
    setLoading(false);
  }

  useEffect(() => { loadFuncionarios(); }, [postoId]);
  useEffect(() => { load(); }, [postoId, filterMes, filterAno]);

  // ─── compute rows ──────────────────────────────────────────────────────────

  const rows = useMemo(() => {
    return funcionarios
      .filter((f) => f.status === 'ativo')
      .map((f) => {
        const st = stats.find((s) => s.funcionario_id === f.id) ?? {
          funcionario_id: f.id, faltas: 0, faltas_justificadas: 0, atrasos: 0, horas_extra: 0, atestados: 0, advertencias: 0, suspensoes: 0,
          auto_descontos: 0, auto_vale_quinzenal: 0, auto_quebra_desc: 0, auto_quebra_credito: 0,
        };
        const fech = fechamentos.find((fe) => fe.funcionario_id === f.id);
        const edit = editRows[f.id] ?? EMPTY_EDIT;
        return { funcionario: f, stats: st, fech, edit };
      });
  }, [funcionarios, stats, fechamentos, editRows]);

  const filteredRows = useMemo(() => {
    if (filterFunc === '__all__') return rows;
    return rows.filter((r) => r.funcionario.id === filterFunc);
  }, [rows, filterFunc]);

  const { page, setPage, pageSize, handlePageSizeChange, paginatedData, totalPages, totalItems, startIndex, endIndex } =
    usePagination(filteredRows, [filterMes, filterAno, postoId, filterFunc], { sessionKey: 'fechamento_pageSize' });

  // ─── column count for colSpan ─────────────────────────────────────────────

  // Fixed: Nome, Atestados, Vale Funcionário, Vale Quinzenal, Desc. Quebra, Créd. Quebra, Obs, Actions = 8
  const visibleOptionalCount = COL_KEYS.filter((k) => showCols[k]).length;
  const totalColSpan = 8 + visibleOptionalCount;

  // ─── save row ──────────────────────────────────────────────────────────────

  function setEditField(funcId: string, field: keyof EditRow, value: string) {
    setEditRows((prev) => ({
      ...prev,
      [funcId]: { ...(prev[funcId] ?? EMPTY_EDIT), [field]: value },
    }));
  }

  function toggleCol(key: ColKey) {
    setShowCols((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave(row: typeof rows[number]) {
    const { funcionario, stats: st, fech, edit } = row;
    if (!postoId) return;
    if (fech?.fechado) return;

    setSavingId(funcionario.id);
    const mes = Number(filterMes);
    const ano = Number(filterAno);

    const payload = {
      funcionario_id: funcionario.id,
      posto_id: postoId,
      mes,
      ano,
      faltas: st.faltas,
      atrasos: st.atrasos,
      horas_extra: st.horas_extra,
      atestados: st.atestados,
      advertencias: st.advertencias,
      suspensoes: st.suspensoes,
      premiacao: 0,           // removed from UI; kept at 0 for DB compat
      descontos: st.auto_descontos,  // auto-calculated from ocorrências, not editable
      vale_transporte: 0,     // removed from UI; kept at 0 for DB compat
      quebra_caixa: st.auto_quebra_desc,
      observacoes: edit.observacoes || null,
      fechado: false,
    };

    const { error } = await (supabase as any)
      .from('pessoal_fechamentos')
      .upsert(payload, { onConflict: 'funcionario_id,mes,ano' });

    if (error) { toast.error('Erro ao salvar'); }
    else { toast.success(`Fechamento de ${funcionario.nome} salvo`); await load(); }
    setSavingId(null);
  }

  async function handleToggleLock(row: typeof rows[number]) {
    if (!row.fech) return;
    const { error } = await (supabase as any)
      .from('pessoal_fechamentos')
      .update({ fechado: !row.fech.fechado })
      .eq('id', row.fech.id);
    if (error) { toast.error('Erro'); }
    else { toast.success(row.fech.fechado ? 'Fechamento reaberto' : 'Fechamento encerrado'); await load(); }
  }

  // ─── CSV export ────────────────────────────────────────────────────────────

  function exportCSV() {
    const mes = Number(filterMes);
    const ano = Number(filterAno);
    const header = [
      'Nome', 'Cargo', 'Escala', 'Horário', 'Ad. Noturno', 'H. Extra Fixas',
      'Faltas', 'Faltas Just.', 'Atrasos (h)', 'Horas Extra', 'Atestados', 'Advertências', 'Suspensões',
      'Vale Funcionário', 'Vale Quinzenal', 'Desc. Quebra de Caixa', 'Créd. Quebra de Caixa', 'Observações',
    ];
    const csvRows = filteredRows.map(({ funcionario, stats: st, fech, edit }) => {
      const horario = funcionario.horario_entrada && funcionario.horario_saida
        ? `${funcionario.horario_entrada}-${funcionario.horario_saida}` : '';
      return [
        funcionario.nome,
        funcionario.cargo,
        funcionario.escala_trabalho ?? '',
        horario,
        funcionario.adicional_noturno ? 'Sim' : 'Não',
        funcionario.horas_extras_fixas_mes ?? 0,
        st.faltas,
        st.faltas_justificadas,
        st.atrasos.toFixed(2),
        st.horas_extra.toFixed(2),
        st.atestados,
        st.advertencias,
        st.suspensoes,
        (st.auto_descontos > 0 ? -st.auto_descontos : 0).toFixed(2),
        (st.auto_vale_quinzenal > 0 ? -st.auto_vale_quinzenal : 0).toFixed(2),
        (st.auto_quebra_desc > 0 ? -st.auto_quebra_desc : 0).toFixed(2),
        st.auto_quebra_credito.toFixed(2),
        fech?.observacoes ?? edit.observacoes,
      ];
    });
    const csv = '\ufeff' + [header, ...csvRows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fechamento_${MONTHS[mes - 1]}_${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── render ────────────────────────────────────────────────────────────────

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - 2 + i));

  if (!postoId) {
    return <div className="text-center text-muted-foreground py-16">Selecione um posto no cabeçalho.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar - row 1: selects */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          {showPostoSelector && (
            <Select value={localPostoId} onValueChange={setLocalPostoId}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Posto" /></SelectTrigger>
              <SelectContent>{allPostos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={filterMes} onValueChange={setFilterMes}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterAno} onValueChange={setFilterAno}>
            <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterFunc} onValueChange={setFilterFunc}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Funcionário" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os funcionários</SelectItem>
              {funcionarios.filter((f) => f.status === 'ativo').map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportCSV}>
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </Button>
      </div>

      {/* Toolbar - row 2: column visibility */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span className="text-xs text-muted-foreground font-medium">Colunas:</span>
        {COL_KEYS.map((key) => (
          <div key={key} className="flex items-center gap-1.5">
            <Checkbox
              id={`col-${key}`}
              checked={showCols[key]}
              onCheckedChange={() => toggleCol(key)}
              className="h-3.5 w-3.5"
            />
            <Label htmlFor={`col-${key}`} className="text-xs cursor-pointer select-none">{COL_LABELS[key]}</Label>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Funcionário</TableHead>
                  {showCols.escala     && <TableHead className="text-xs text-center">Escala</TableHead>}
                  {showCols.horario    && <TableHead className="text-xs text-center">Horário</TableHead>}
                  {showCols.adicNoturno && <TableHead className="text-xs text-center">Ad. Noturno</TableHead>}
                  {showCols.faltas     && <TableHead className="text-xs text-center">Faltas</TableHead>}
                  {showCols.faltasJust && <TableHead className="text-xs text-center">Faltas Just.</TableHead>}
                  {showCols.atrasos    && <TableHead className="text-xs text-center">Atrasos (h)</TableHead>}
                  {showCols.horasExtra && <TableHead className="text-xs text-center">H. Extra</TableHead>}
                  {showCols.hExtraFixas && <TableHead className="text-xs text-center">H. Extra Fixas</TableHead>}
                  <TableHead className="text-xs text-center">Atestados</TableHead>
                  {showCols.advertencias && <TableHead className="text-xs text-center">Advert.</TableHead>}
                  {showCols.suspensoes   && <TableHead className="text-xs text-center">Susp.</TableHead>}
                  <TableHead className="text-xs">Vale Funcionário (R$)</TableHead>
                  <TableHead className="text-xs">Vale Quinzenal (R$)</TableHead>
                  <TableHead className="text-xs">Desc. Quebra Caixa (R$)</TableHead>
                  <TableHead className="text-xs">Créd. Quebra Caixa (R$)</TableHead>
                  <TableHead className="text-xs">Obs.</TableHead>
                  <TableHead className="text-xs w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={totalColSpan} className="text-center text-xs text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                )}
                {!loading && paginatedData.length === 0 && (
                  <TableRow><TableCell colSpan={totalColSpan} className="text-center text-xs text-muted-foreground py-8">Nenhum funcionário ativo.</TableCell></TableRow>
                )}
                {paginatedData.map(({ funcionario, stats: st, fech, edit }) => {
                  const locked = fech?.fechado ?? false;
                  const isSaving = savingId === funcionario.id;
                  return (
                    <TableRow key={funcionario.id} className={`text-xs ${locked ? 'bg-muted/40' : ''}`}>
                      <TableCell>
                        <div className="font-medium">{funcionario.nome}</div>
                        <div className="text-muted-foreground text-[10px]">{funcionario.cargo}</div>
                      </TableCell>
                      {showCols.escala && (
                        <TableCell className="text-center text-[11px]">
                          {funcionario.escala_trabalho ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {showCols.horario && (
                        <TableCell className="text-center text-[11px]">
                          {funcionario.horario_entrada && funcionario.horario_saida
                            ? `${funcionario.horario_entrada}–${funcionario.horario_saida}`
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {showCols.adicNoturno && (
                        <TableCell className="text-center text-[11px]">
                          {funcionario.adicional_noturno
                            ? <span className="text-blue-600 font-medium">Sim</span>
                            : <span className="text-muted-foreground">Não</span>}
                        </TableCell>
                      )}
                      {showCols.faltas && (
                        <TableCell className="text-center">
                          <span className={st.faltas > 0 ? 'text-red-600 font-bold' : ''}>{st.faltas}</span>
                        </TableCell>
                      )}
                      {showCols.faltasJust && (
                        <TableCell className="text-center">
                          <span className={st.faltas_justificadas > 0 ? 'text-amber-600 font-medium' : ''}>{st.faltas_justificadas}</span>
                        </TableCell>
                      )}
                      {showCols.atrasos && (
                        <TableCell className="text-center">
                          <span className={st.atrasos > 0 ? 'text-orange-600 font-medium' : ''}>{st.atrasos > 0 ? `${st.atrasos}h` : '0'}</span>
                        </TableCell>
                      )}
                      {showCols.horasExtra && (
                        <TableCell className="text-center">
                          <span className={st.horas_extra > 0 ? 'text-blue-600 font-medium' : ''}>{st.horas_extra}h</span>
                        </TableCell>
                      )}
                      {showCols.hExtraFixas && (
                        <TableCell className="text-center">
                          {(funcionario.horas_extras_fixas_mes ?? 0) > 0
                            ? <span className="text-violet-600 font-medium">{funcionario.horas_extras_fixas_mes}h</span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      <TableCell className="text-center">{st.atestados}</TableCell>
                      {showCols.advertencias && (
                        <TableCell className="text-center">
                          <span className={st.advertencias > 0 ? 'text-yellow-600 font-medium' : ''}>{st.advertencias}</span>
                        </TableCell>
                      )}
                      {showCols.suspensoes && (
                        <TableCell className="text-center">
                          <span className={st.suspensoes > 0 ? 'text-red-700 font-bold' : ''}>{st.suspensoes}</span>
                        </TableCell>
                      )}

                      {/* Vale Funcionário — read-only, auto-calculated from ocorrências */}
                      <TableCell>
                        {st.auto_descontos > 0 ? (
                          <span className="text-red-600 font-medium whitespace-nowrap">{negBRL(st.auto_descontos)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Vale Quinzenal — read-only, auto-computed from ocorrências */}
                      <TableCell className="text-center">
                        {st.auto_vale_quinzenal > 0 ? (
                          <span className="text-red-600 font-medium whitespace-nowrap">{negBRL(st.auto_vale_quinzenal)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Desconto Quebra de Caixa — read-only, auto-computed from ocorrências */}
                      <TableCell>
                        {st.auto_quebra_desc > 0 ? (
                          <span className="text-red-600 font-medium whitespace-nowrap">{negBRL(st.auto_quebra_desc)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Crédito Quebra de Caixa — read-only, auto-computed from ocorrências */}
                      <TableCell className="text-center">
                        {st.auto_quebra_credito > 0 ? (
                          <span className="text-green-700 font-medium">{formatBRL(st.auto_quebra_credito)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        {locked ? (
                          <span className="text-xs text-muted-foreground">{edit.observacoes || '—'}</span>
                        ) : (
                          <Input
                            className="h-7 text-xs w-32"
                            value={edit.observacoes}
                            onChange={(e) => setEditField(funcionario.id, 'observacoes', e.target.value)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!locked && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              disabled={isSaving}
                              onClick={() => handleSave({ funcionario, stats: st, fech, edit })}
                              title="Salvar"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {fech && (
                            <Button
                              variant="ghost" size="icon"
                              className={`h-7 w-7 ${locked ? 'text-green-600' : 'text-orange-600'}`}
                              onClick={() => handleToggleLock({ funcionario, stats: st, fech, edit })}
                              title={locked ? 'Reabrir' : 'Fechar mês'}
                            >
                              {locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <PaginationControls
            page={page} totalPages={totalPages} pageSize={pageSize}
            totalItems={totalItems} startIndex={startIndex} endIndex={endIndex}
            onPageChange={setPage} onPageSizeChange={handlePageSizeChange}
            itemLabel="funcionários"
          />
        </CardContent>
      </Card>
    </div>
  );
}
