import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp, Lock, Search, Users } from 'lucide-react';
import { toast } from 'sonner';

// ─── types ─────────────────────────────────────────────────────────────────────

interface FuncRow {
  id: string;
  nome: string;
  cpf: string | null;
  rg: string | null;
  cargo: string;
  data_admissao: string;
  status: 'ativo' | 'desligado';
  posto_id: string;
  posto_nome: string;
}

interface DesligInfo {
  data_desligamento: string;
  motivo: string;
  observacoes: string | null;
  pode_recontratar: boolean | null;
}

interface FecStats {
  advertencias: number;
  suspensoes: number;
  faltas: number;
}

interface Fechamento {
  id: string;
  funcionario_id: string;
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
}

// ─── helpers ───────────────────────────────────────────────────────────────────

const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function formatDate(str: string | null) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function formatCPF(cpf: string | null) {
  if (!cpf) return '—';
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function formatBRL(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Variant = 'green' | 'yellow' | 'red';

function getVariant(status: string, deslig: DesligInfo | undefined): Variant {
  if (status === 'ativo') return 'green';
  if (deslig?.pode_recontratar === false) return 'red';
  return 'yellow';
}

const BORDER: Record<Variant, string> = {
  green:  'border-l-4 border-l-green-500 border border-green-200',
  yellow: 'border-l-4 border-l-yellow-500 border border-yellow-200',
  red:    'border-l-4 border-l-red-500 border border-red-200',
};

const DOT: Record<Variant, string> = {
  green:  'bg-green-500',
  yellow: 'bg-yellow-500',
  red:    'bg-red-500',
};

function fecBorderBg(f: Fechamento) {
  if (f.advertencias >= 2 || f.suspensoes >= 1 || f.faltas >= 3) return 'border-l-4 border-l-red-400 bg-red-50';
  if (f.faltas >= 1 || f.atrasos >= 3 || f.advertencias >= 1) return 'border-l-4 border-l-yellow-400 bg-yellow-50';
  return 'border-l-4 border-l-green-400 bg-green-50';
}

function fecDot(f: Fechamento) {
  if (f.advertencias >= 2 || f.suspensoes >= 1 || f.faltas >= 3) return 'bg-red-500';
  if (f.faltas >= 1 || f.atrasos >= 3 || f.advertencias >= 1) return 'bg-yellow-500';
  return 'bg-green-500';
}

// ─── component ─────────────────────────────────────────────────────────────────

export default function HistoricoFuncionario() {
  const { selectedPostoId, allPostos, role, hasPermission } = useAuth();
  const isRedeView = role === 'admin' || hasPermission('historico-rede');

  const [funcionarios, setFuncionarios] = useState<FuncRow[]>([]);
  const [desligMap, setDesligMap] = useState<Map<string, DesligInfo>>(new Map());
  const [statsMap, setStatsMap] = useState<Map<string, FecStats>>(new Map());

  const [search, setSearch] = useState('');
  const [filterPosto, setFilterPosto] = useState('__all__');
  const [filterStatus, setFilterStatus] = useState('__all__');
  const [filterCargo, setFilterCargo] = useState('__all__');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedFecId, setExpandedFecId] = useState<string | null>(null);
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [loadingExpand, setLoadingExpand] = useState(false);

  // ─── data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;

    async function loadAll() {
      // 1. Funcionários
      let query = (supabase as any)
        .from('pessoal_funcionarios')
        .select('id, nome, cpf, rg, cargo, data_admissao, status, posto_id')
        .order('nome');
      if (!isRedeView && selectedPostoId) query = query.eq('posto_id', selectedPostoId);

      const { data: funcData, error: funcErr } = await query;
      if (!active) return;
      if (funcErr) { toast.error('Erro ao carregar funcionários'); return; }

      const postoMap = Object.fromEntries(allPostos.map((p) => [p.id, p.nome]));
      const funcs: FuncRow[] = (funcData ?? []).map((f: any) => ({
        ...f,
        posto_nome: postoMap[f.posto_id] ?? '—',
      }));
      setFuncionarios(funcs);
      if (funcs.length === 0) return;

      const funcIds = funcs.map((f) => f.id);

      // 2. Desligamentos — pick most recent per funcionário
      const { data: desligData } = await (supabase as any)
        .from('pessoal_desligamentos')
        .select('funcionario_id, data_desligamento, motivo, observacoes, pode_recontratar')
        .in('funcionario_id', funcIds)
        .order('data_desligamento', { ascending: false });
      if (!active) return;

      const dMap = new Map<string, DesligInfo>();
      (desligData ?? []).forEach((d: any) => {
        if (!dMap.has(d.funcionario_id)) {
          dMap.set(d.funcionario_id, {
            data_desligamento: d.data_desligamento,
            motivo: d.motivo,
            observacoes: d.observacoes,
            pode_recontratar: d.pode_recontratar,
          });
        }
      });
      setDesligMap(dMap);

      // 3. Aggregate stats from fechamentos
      const { data: fechData } = await (supabase as any)
        .from('pessoal_fechamentos')
        .select('funcionario_id, advertencias, suspensoes, faltas')
        .in('funcionario_id', funcIds);
      if (!active) return;

      const sMap = new Map<string, FecStats>();
      (fechData ?? []).forEach((f: any) => {
        const cur = sMap.get(f.funcionario_id) ?? { advertencias: 0, suspensoes: 0, faltas: 0 };
        sMap.set(f.funcionario_id, {
          advertencias: cur.advertencias + (f.advertencias ?? 0),
          suspensoes:   cur.suspensoes   + (f.suspensoes   ?? 0),
          faltas:       cur.faltas       + (f.faltas       ?? 0),
        });
      });
      setStatsMap(sMap);
    }

    loadAll();
    return () => { active = false; };
  }, [isRedeView, selectedPostoId, allPostos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadFechamentos(funcId: string) {
    setLoadingExpand(true);
    setFechamentos([]);
    const { data, error } = await (supabase as any)
      .from('pessoal_fechamentos')
      .select('*')
      .eq('funcionario_id', funcId)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false });
    if (error) toast.error('Erro ao carregar histórico');
    else setFechamentos(data ?? []);
    setLoadingExpand(false);
  }

  function toggleExpand(funcId: string) {
    if (expandedId === funcId) {
      setExpandedId(null);
      setFechamentos([]);
    } else {
      setExpandedId(funcId);
      setExpandedFecId(null);
      loadFechamentos(funcId);
    }
  }

  // ─── derived ─────────────────────────────────────────────────────────────────

  const cargos = useMemo(() =>
    Array.from(new Set(funcionarios.map((f) => f.cargo).filter(Boolean))).sort()
  , [funcionarios]);

  const postoOptions = useMemo(() => {
    const map = new Map<string, string>();
    funcionarios.forEach((f) => { if (f.posto_id) map.set(f.posto_id, f.posto_nome); });
    return Array.from(map.entries())
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [funcionarios]);

  const filtered = useMemo(() => {
    const qRaw = search.trim().toLowerCase();
    const qDigits = qRaw.replace(/\D/g, '');
    return funcionarios.filter((f) => {
      if (qRaw) {
        const nm  = f.nome.toLowerCase().includes(qRaw);
        const cpf = qDigits.length > 0 && (f.cpf ?? '').replace(/\D/g, '').includes(qDigits);
        const rg  = f.rg ? (f.rg.toLowerCase().includes(qRaw) || (qDigits.length > 0 && f.rg.replace(/\D/g, '').includes(qDigits))) : false;
        if (!nm && !cpf && !rg) return false;
      }
      if (filterPosto !== '__all__' && f.posto_id !== filterPosto) return false;
      if (filterStatus !== '__all__') {
        const v = getVariant(f.status, desligMap.get(f.id));
        if (filterStatus === 'ativo'              && v !== 'green')  return false;
        if (filterStatus === 'desligado-pode'     && v !== 'yellow') return false;
        if (filterStatus === 'desligado-nao-pode' && v !== 'red')    return false;
      }
      if (filterCargo !== '__all__' && f.cargo !== filterCargo) return false;
      return true;
    });
  }, [funcionarios, search, filterPosto, filterStatus, filterCargo, desligMap]);

  // Group fechamentos by year for the expanded timeline
  const byYear: Record<number, Fechamento[]> = {};
  fechamentos.forEach((f) => {
    if (!byYear[f.ano]) byYear[f.ano] = [];
    byYear[f.ano].push(f);
  });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  if (!isRedeView && !selectedPostoId) {
    return <div className="text-center text-muted-foreground py-16">Selecione um posto no cabeçalho.</div>;
  }

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative min-w-[200px] flex-1 max-w-[320px]">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Buscar por nome, CPF ou RG..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isRedeView && postoOptions.length > 1 && (
          <Select value={filterPosto} onValueChange={setFilterPosto}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os postos</SelectItem>
              {postoOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="desligado-pode">Desligado — pode recontratar</SelectItem>
            <SelectItem value="desligado-nao-pode">Desligado — não recontratar</SelectItem>
          </SelectContent>
        </Select>
        {cargos.length > 0 && (
          <Select value={filterCargo} onValueChange={setFilterCargo}>
            <SelectTrigger className="h-8 w-[155px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os cargos</SelectItem>
              {cargos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {filtered.length} funcionário{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── List ── */}
      {filtered.length === 0 && (
        <div className="text-center text-xs text-muted-foreground py-16 border rounded-lg">
          Nenhum funcionário encontrado.
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((func) => {
          const deslig  = desligMap.get(func.id);
          const stats   = statsMap.get(func.id);
          const variant = getVariant(func.status, deslig);
          const isExp   = expandedId === func.id;

          return (
            <div key={func.id} className={`rounded-r-lg overflow-hidden ${BORDER[variant]}`}>
              {/* ── Row header ── */}
              <button
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors"
                onClick={() => toggleExpand(func.id)}
              >
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 mt-[5px] ${DOT[variant]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm leading-tight">{func.nome}</span>
                    {variant === 'red' && (
                      <Badge className="bg-red-500 hover:bg-red-500 text-white text-[9px] h-4 px-1.5">Não recontratar</Badge>
                    )}
                    {variant === 'yellow' && (
                      <Badge className="bg-yellow-500 hover:bg-yellow-500 text-white text-[9px] h-4 px-1.5">Desligado</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                    <span>{func.cargo}</span>
                    {isRedeView && func.posto_nome !== '—' && <span>· {func.posto_nome}</span>}
                    {func.cpf && <span>· CPF: {formatCPF(func.cpf)}</span>}
                    {func.rg  && <span>· RG: {func.rg}</span>}
                    <span>· Adm: {formatDate(func.data_admissao)}</span>
                  </div>
                  {func.status === 'desligado' && deslig && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Saiu em {formatDate(deslig.data_desligamento)}
                      {deslig.motivo ? ` — ${deslig.motivo}` : ''}
                      {deslig.observacoes ? ` · ${deslig.observacoes}` : ''}
                    </div>
                  )}
                </div>
                {/* Quick stats */}
                <div className="flex gap-1 items-center shrink-0 flex-wrap justify-end self-center">
                  {!!stats?.advertencias && (
                    <span className="text-[10px] bg-yellow-100 text-yellow-800 border border-yellow-200 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                      {stats.advertencias} adv.
                    </span>
                  )}
                  {!!stats?.suspensoes && (
                    <span className="text-[10px] bg-red-100 text-red-800 border border-red-200 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                      {stats.suspensoes} susp.
                    </span>
                  )}
                  {!!stats?.faltas && (
                    <span className="text-[10px] bg-orange-100 text-orange-800 border border-orange-200 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                      {stats.faltas} falta{stats.faltas !== 1 ? 's' : ''}
                    </span>
                  )}
                  {isExp
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />}
                </div>
              </button>

              {/* ── Expanded section ── */}
              {isExp && (
                <div className="border-t bg-white/70">
                  {/* Full details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs px-4 pt-3 pb-3 border-b">
                    <div>
                      <div className="text-muted-foreground mb-0.5">CPF</div>
                      <div className="font-medium">{formatCPF(func.cpf)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-0.5">RG</div>
                      <div className="font-medium">{func.rg || '—'}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-0.5">Cargo</div>
                      <div>{func.cargo || '—'}</div>
                    </div>
                    {isRedeView && (
                      <div>
                        <div className="text-muted-foreground mb-0.5">Posto</div>
                        <div>{func.posto_nome}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-muted-foreground mb-0.5">Admissão</div>
                      <div>{formatDate(func.data_admissao)}</div>
                    </div>
                    {func.status === 'desligado' && deslig && (
                      <>
                        <div>
                          <div className="text-muted-foreground mb-0.5">Data saída</div>
                          <div>{formatDate(deslig.data_desligamento)}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-0.5">Motivo</div>
                          <div>{deslig.motivo || '—'}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-0.5">Pode recontratar?</div>
                          <div className={deslig.pode_recontratar === false ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>
                            {deslig.pode_recontratar === false ? 'Não' : 'Sim'}
                          </div>
                        </div>
                        {deslig.observacoes && (
                          <div className="col-span-2 sm:col-span-4">
                            <div className="text-muted-foreground mb-0.5">Obs. desligamento</div>
                            <div>{deslig.observacoes}</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Monthly timeline */}
                  <div className="px-4 py-3 space-y-3">
                    <div className="text-xs font-semibold text-muted-foreground">Histórico Mensal</div>
                    {loadingExpand && (
                      <div className="text-xs text-muted-foreground text-center py-4">Carregando histórico...</div>
                    )}
                    {!loadingExpand && fechamentos.length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-4 border rounded">
                        Nenhum fechamento mensal registrado.
                      </div>
                    )}
                    {years.map((year) => (
                      <div key={year}>
                        <div className="text-xs font-semibold text-muted-foreground mb-1.5">{year}</div>
                        <div className="space-y-1.5">
                          {byYear[year].map((fe) => {
                            const feExp = expandedFecId === fe.id;
                            return (
                              <div key={fe.id} className={`rounded-r overflow-hidden ${fecBorderBg(fe)}`}>
                                <button
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-black/5 transition-colors"
                                  onClick={() => setExpandedFecId(feExp ? null : fe.id)}
                                >
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${fecDot(fe)}`} />
                                  <span className="font-medium flex-1">{MONTHS_FULL[fe.mes - 1]}</span>
                                  {fe.fechado && <Lock className="w-3 h-3 text-muted-foreground" />}
                                  <div className="flex gap-3 text-muted-foreground">
                                    {fe.faltas       > 0 && <span className="text-red-600">{fe.faltas} falt.</span>}
                                    {fe.atrasos      > 0 && <span className="text-orange-600">{fe.atrasos} atraso{fe.atrasos > 1 ? 's' : ''}</span>}
                                    {fe.horas_extra  > 0 && <span className="text-blue-600">{fe.horas_extra}h extra</span>}
                                    {fe.advertencias > 0 && <span className="text-yellow-700">{fe.advertencias} adv.</span>}
                                    {fe.suspensoes   > 0 && <span className="text-red-700 font-bold">{fe.suspensoes} susp.</span>}
                                  </div>
                                  {feExp
                                    ? <ChevronUp className="w-3.5 h-3.5" />
                                    : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                                {feExp && (
                                  <div className="border-t px-3 py-2 bg-white/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div>
                                      <div className="text-muted-foreground mb-1">Ocorrências</div>
                                      <div className="space-y-0.5">
                                        <div>Faltas: <span className={fe.faltas > 0 ? 'text-red-600 font-bold' : ''}>{fe.faltas}</span></div>
                                        <div>Atrasos: <span className={fe.atrasos > 0 ? 'text-orange-600' : ''}>{fe.atrasos}</span></div>
                                        <div>Horas extra: <span className={fe.horas_extra > 0 ? 'text-blue-600' : ''}>{fe.horas_extra}h</span></div>
                                        <div>Atestados: {fe.atestados}</div>
                                        <div>Advertências: <span className={fe.advertencias > 0 ? 'text-yellow-700 font-medium' : ''}>{fe.advertencias}</span></div>
                                        <div>Suspensões: <span className={fe.suspensoes > 0 ? 'text-red-700 font-bold' : ''}>{fe.suspensoes}</span></div>
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-muted-foreground mb-1">Financeiro</div>
                                      <div className="space-y-0.5">
                                        <div>Descontos: <span className={fe.descontos > 0 ? 'text-red-600' : ''}>{formatBRL(fe.descontos)}</span></div>
                                        <div>Quebra caixa: {formatBRL(fe.quebra_caixa)}</div>
                                      </div>
                                    </div>
                                    {fe.observacoes && (
                                      <div className="col-span-2">
                                        <div className="text-muted-foreground mb-1">Observações</div>
                                        <div className="whitespace-pre-wrap">{fe.observacoes}</div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
