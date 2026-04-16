import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { toast } from 'sonner';

// ─── types ──────────────────────────────────────────────────────────────────

interface Funcionario {
  id: string;
  nome: string;
  cargo: string;
  data_admissao: string;
  status: 'ativo' | 'desligado';
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

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function formatDate(str: string | null) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function formatBRL(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function cardColor(f: Fechamento) {
  if (f.advertencias >= 2 || f.suspensoes >= 1 || f.faltas >= 3) return 'border-red-400 bg-red-50';
  if (f.faltas >= 1 || f.atrasos >= 3 || f.advertencias >= 1) return 'border-yellow-400 bg-yellow-50';
  return 'border-green-400 bg-green-50';
}

function dotColor(f: Fechamento) {
  if (f.advertencias >= 2 || f.suspensoes >= 1 || f.faltas >= 3) return 'bg-red-500';
  if (f.faltas >= 1 || f.atrasos >= 3 || f.advertencias >= 1) return 'bg-yellow-500';
  return 'bg-green-500';
}

// ─── main component ─────────────────────────────────────────────────────────

export default function HistoricoFuncionario() {
  const { selectedPostoId, allPostos } = useAuth();

  const showPostoSelector = allPostos.length > 0;
  const [localPostoId, setLocalPostoId] = useState<string>(selectedPostoId ?? '');
  useEffect(() => { if (selectedPostoId) setLocalPostoId(selectedPostoId); }, [selectedPostoId]);
  const postoId = showPostoSelector ? localPostoId : (selectedPostoId ?? '');

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [selectedFuncId, setSelectedFuncId] = useState('');
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadFuncionarios() {
    if (!postoId) return;
    const { data } = await (supabase as any)
      .from('pessoal_funcionarios')
      .select('id, nome, cargo, data_admissao, status')
      .eq('posto_id', postoId)
      .order('nome');
    setFuncionarios(data ?? []);
    if (data && data.length > 0 && !selectedFuncId) {
      setSelectedFuncId(data[0].id);
    }
  }

  async function loadHistorico() {
    if (!selectedFuncId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('pessoal_fechamentos')
      .select('*')
      .eq('funcionario_id', selectedFuncId)
      .order('ano', { ascending: false })
      .order('mes', { ascending: false });
    if (error) { toast.error('Erro ao carregar histórico'); }
    else { setFechamentos(data ?? []); }
    setLoading(false);
  }

  useEffect(() => { loadFuncionarios(); }, [postoId]);
  useEffect(() => { loadHistorico(); }, [selectedFuncId]);

  const selectedFunc = funcionarios.find((f) => f.id === selectedFuncId);

  // Group by year
  const byYear: Record<number, Fechamento[]> = {};
  fechamentos.forEach((f) => {
    if (!byYear[f.ano]) byYear[f.ano] = [];
    byYear[f.ano].push(f);
  });
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  if (!postoId) {
    return <div className="text-center text-muted-foreground py-16">Selecione um posto no cabeçalho.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="flex gap-2 flex-wrap items-center">
        {showPostoSelector && (
          <Select value={localPostoId} onValueChange={setLocalPostoId}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Posto" /></SelectTrigger>
            <SelectContent>{allPostos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={selectedFuncId} onValueChange={setSelectedFuncId}>
          <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder="Selecionar funcionário" /></SelectTrigger>
          <SelectContent>
            {funcionarios.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nome} {f.status === 'desligado' ? '(desligado)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Employee info card */}
      {selectedFunc && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full shrink-0 ${selectedFunc.status === 'ativo' ? 'bg-green-500' : 'bg-gray-400'}`} />
            <div>
              <div className="font-semibold text-sm">{selectedFunc.nome}</div>
              <div className="text-xs text-muted-foreground">{selectedFunc.cargo} · Admissão: {formatDate(selectedFunc.data_admissao)}</div>
            </div>
            {selectedFunc.status === 'desligado' && (
              <Badge className="ml-auto bg-gray-400 text-white text-[10px]">Desligado</Badge>
            )}
          </div>
        </Card>
      )}

      {/* Timeline */}
      {loading && <div className="text-center text-xs text-muted-foreground py-8">Carregando histórico...</div>}

      {!loading && fechamentos.length === 0 && selectedFuncId && (
        <div className="text-center text-xs text-muted-foreground py-12 border rounded-lg">
          Nenhum fechamento mensal registrado para este funcionário.
        </div>
      )}

      {years.map((year) => (
        <div key={year}>
          <div className="text-sm font-semibold text-muted-foreground mb-2">{year}</div>
          <div className="space-y-2">
            {byYear[year].map((f) => {
              const isExpanded = expandedId === f.id;
              return (
                <div key={f.id} className={`border-l-4 rounded-r-lg ${cardColor(f)} p-0 overflow-hidden`}>
                  {/* Header row */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/5 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : f.id)}
                  >
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor(f)}`} />
                    <span className="text-sm font-medium flex-1">
                      {MONTHS_FULL[f.mes - 1]}
                    </span>
                    {f.fechado && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {f.faltas > 0 && <span className="text-red-600">{f.faltas} falta{f.faltas > 1 ? 's' : ''}</span>}
                      {f.atrasos > 0 && <span className="text-orange-600">{f.atrasos} atraso{f.atrasos > 1 ? 's' : ''}</span>}
                      {f.horas_extra > 0 && <span className="text-blue-600">{f.horas_extra}h extra</span>}
                      {f.advertencias > 0 && <span className="text-yellow-700">{f.advertencias} advert.</span>}
                      {f.suspensoes > 0 && <span className="text-red-700 font-bold">{f.suspensoes} susp.</span>}
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t px-4 py-3 bg-white/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground mb-1">Ocorrências</div>
                        <div className="space-y-0.5">
                          <div>Faltas: <span className={f.faltas > 0 ? 'text-red-600 font-bold' : ''}>{f.faltas}</span></div>
                          <div>Atrasos: <span className={f.atrasos > 0 ? 'text-orange-600' : ''}>{f.atrasos}</span></div>
                          <div>Horas extra: <span className={f.horas_extra > 0 ? 'text-blue-600' : ''}>{f.horas_extra}h</span></div>
                          <div>Atestados: {f.atestados}</div>
                          <div>Advertências: <span className={f.advertencias > 0 ? 'text-yellow-700 font-medium' : ''}>{f.advertencias}</span></div>
                          <div>Suspensões: <span className={f.suspensoes > 0 ? 'text-red-700 font-bold' : ''}>{f.suspensoes}</span></div>
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground mb-1">Financeiro</div>
                        <div className="space-y-0.5">
                          <div>Premiação: <span className="font-medium">{formatBRL(f.premiacao)}</span></div>
                          <div>Descontos: <span className={f.descontos > 0 ? 'text-red-600' : ''}>{formatBRL(f.descontos)}</span></div>
                          <div>V. Transporte: {formatBRL(f.vale_transporte)}</div>
                          <div>Quebra Caixa: {formatBRL(f.quebra_caixa)}</div>
                        </div>
                      </div>
                      {f.observacoes && (
                        <div className="col-span-2">
                          <div className="text-muted-foreground mb-1">Observações</div>
                          <div>{f.observacoes}</div>
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
  );
}
