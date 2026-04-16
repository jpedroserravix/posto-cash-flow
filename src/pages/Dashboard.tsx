import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import {
  CheckCircle2, AlertTriangle, Clock, Banknote,
  FileWarning, ArrowRight, Building2, TrendingDown,
} from 'lucide-react';

interface ChartDay {
  date: string;
  brinks: number;
  manual: number;
}

interface CaixaItem {
  id: string;
  posto_id: string;
  posto_nome: string;
  data: string;
  centro_custo: string | null;
  conferido: string;
}

interface PostoSummary {
  posto_id: string;
  posto_nome: string;
  todayBrinks: number;
  todayManual: number;
  okCount: number;
  pendenteCount: number;
  divergenciaCount: number;
  semQualityCount: number;
}

export default function Dashboard() {
  const { allPostos, setSelectedPostoId } = useAuth();
  const navigate = useNavigate();

  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [loading, setLoading] = useState(true);

  const [totalBrinks, setTotalBrinks] = useState(0);
  const [totalManual, setTotalManual] = useState(0);
  const [totalDespesas, setTotalDespesas] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ ok: 0, pendente: 0, divergencia: 0 });
  const [chartData, setChartData] = useState<ChartDay[]>([]);
  const [pendingCaixas, setPendingCaixas] = useState<CaixaItem[]>([]);
  const [semQualityList, setSemQualityList] = useState<CaixaItem[]>([]);
  const [postoSummaries, setPostoSummaries] = useState<PostoSummary[]>([]);

  useEffect(() => {
    if (allPostos.length > 0) load();
  }, [allPostos, selectedDate]);

  const load = async () => {
    setLoading(true);
    const postoIds = allPostos.map((p) => p.id);

    const sevenDaysAgo = new Date(selectedDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const [
      { data: brinksToday },
      { data: manuaisToday },
      { data: conferencias },
      { data: quality },
      { data: brinks7 },
      { data: manuais7 },
    ] = await Promise.all([
      supabase
        .from('depositos_brinks')
        .select('posto_id, valor')
        .in('posto_id', postoIds)
        .eq('data_caixa', selectedDate),
      supabase
        .from('depositos_manuais')
        .select('posto_id, valor_lancado')
        .in('posto_id', postoIds)
        .eq('data', selectedDate),
      supabase
        .from('resumo_conferencia')
        .select('id, posto_id, data, conferido, centro_custo')
        .in('posto_id', postoIds)
        .order('data', { ascending: false }),
      supabase
        .from('relatorio_quality')
        .select('posto_id, data_caixa, pdf_path, total_despesas')
        .in('posto_id', postoIds),
      supabase
        .from('depositos_brinks')
        .select('posto_id, data_caixa, valor')
        .in('posto_id', postoIds)
        .gte('data_caixa', sevenDaysAgoStr)
        .lte('data_caixa', selectedDate),
      supabase
        .from('depositos_manuais')
        .select('posto_id, data, valor_lancado')
        .in('posto_id', postoIds)
        .gte('data', sevenDaysAgoStr)
        .lte('data', selectedDate),
    ]);

    // Today totals
    const bTotal = (brinksToday || []).reduce((s, d) => s + (d.valor || 0), 0);
    const mTotal = (manuaisToday || []).reduce((s, d) => s + (d.valor_lancado || 0), 0);
    setTotalBrinks(bTotal);
    setTotalManual(mTotal);

    // Today status counts
    const todayConf = (conferencias || []).filter((c) => c.data === selectedDate);
    setStatusCounts({
      ok: todayConf.filter((c) => c.conferido === 'OK').length,
      pendente: todayConf.filter((c) => c.conferido === 'PENDENTE').length,
      divergencia: todayConf.filter((c) => c.conferido === 'DIVERGÊNCIA').length,
    });

    // Today total despesas (from quality)
    const despTotal = (quality || [])
      .filter((q) => q.data_caixa === selectedDate)
      .reduce((s, q) => s + (q.total_despesas || 0), 0);
    setTotalDespesas(despTotal);

    // 7-day chart
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    });
    setChartData(
      days.map((date) => ({
        date: new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        brinks: (brinks7 || []).filter((b) => b.data_caixa === date).reduce((s, b) => s + (b.valor || 0), 0),
        manual: (manuais7 || []).filter((m) => m.data === date).reduce((s, m) => s + (m.valor_lancado || 0), 0),
      }))
    );

    // Last 5 pending/divergent
    setPendingCaixas(
      (conferencias || [])
        .filter((c) => c.conferido !== 'OK')
        .slice(0, 5)
        .map((c) => ({
          id: c.id,
          posto_id: c.posto_id,
          posto_nome: allPostos.find((p) => p.id === c.posto_id)?.nome || '',
          data: c.data,
          centro_custo: c.centro_custo,
          conferido: c.conferido,
        }))
    );

    // Sem Quality PDF (distinct posto+date, most recent first)
    const qualityMap = new Map(
      (quality || []).filter((q) => q.pdf_path).map((q) => [`${q.posto_id}-${q.data_caixa}`, true])
    );
    const seen = new Set<string>();
    const semQ: CaixaItem[] = [];
    for (const c of conferencias || []) {
      const key = `${c.posto_id}-${c.data}`;
      if (!seen.has(key) && !qualityMap.has(key)) {
        seen.add(key);
        semQ.push({
          id: c.id,
          posto_id: c.posto_id,
          posto_nome: allPostos.find((p) => p.id === c.posto_id)?.nome || '',
          data: c.data,
          centro_custo: c.centro_custo,
          conferido: c.conferido,
        });
        if (semQ.length >= 8) break;
      }
    }
    setSemQualityList(semQ);

    // Per-posto summaries
    setPostoSummaries(
      allPostos.map((posto) => {
        const pConfs = (conferencias || []).filter((c) => c.posto_id === posto.id);
        return {
          posto_id: posto.id,
          posto_nome: posto.nome,
          todayBrinks: (brinksToday || []).filter((d) => d.posto_id === posto.id).reduce((s, d) => s + (d.valor || 0), 0),
          todayManual: (manuaisToday || []).filter((d) => d.posto_id === posto.id).reduce((s, d) => s + (d.valor_lancado || 0), 0),
          okCount: pConfs.filter((c) => c.conferido === 'OK').length,
          pendenteCount: pConfs.filter((c) => c.conferido === 'PENDENTE').length,
          divergenciaCount: pConfs.filter((c) => c.conferido === 'DIVERGÊNCIA').length,
          semQualityCount: (() => {
            const seen2 = new Set<string>();
            let count = 0;
            for (const c of pConfs) {
              const key = `${posto.id}-${c.data}`;
              if (!seen2.has(key)) {
                seen2.add(key);
                if (!qualityMap.has(key)) count++;
              }
            }
            return count;
          })(),
        };
      })
    );

    setLoading(false);
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');

  const goToResumo = (postoId: string) => {
    setSelectedPostoId(postoId);
    navigate('/resumo');
  };

  if (!allPostos.length) {
    return <p className="py-8 text-center text-muted-foreground">Nenhum posto cadastrado.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Referência:</span>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="h-8 w-40 text-sm"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total Depositado</p>
                <p className="text-lg font-bold mt-0.5 truncate">{fmt(totalBrinks + totalManual)}</p>
                <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                  Brinks: {fmt(totalBrinks)}<br />Manual: {fmt(totalManual)}
                </p>
              </div>
              <Banknote className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Caixas OK</p>
                <p className="text-3xl font-bold mt-0.5 text-green-600">{loading ? '—' : statusCounts.ok}</p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Pendentes</p>
                <p className="text-3xl font-bold mt-0.5 text-yellow-600">{loading ? '—' : statusCounts.pendente}</p>
              </div>
              <Clock className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Divergências</p>
                <p className="text-3xl font-bold mt-0.5 text-red-600">{loading ? '—' : statusCounts.divergencia}</p>
              </div>
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Sem Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium">Depósitos — Últimos 7 dias</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  width={52}
                />
                <Tooltip formatter={(v: number) => [fmt(v)]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="brinks" name="Brinks" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                <Bar dataKey="manual" name="Manual" fill="#22c55e" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-orange-500" />
              Sem PDF Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : semQualityList.length === 0 ? (
              <p className="text-xs text-muted-foreground">Todos os caixas têm PDF importado.</p>
            ) : (
              <div className="space-y-0.5">
                {semQualityList.map((c) => (
                  <button
                    key={c.id}
                    className="w-full flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors"
                    onClick={() => goToResumo(c.posto_id)}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{fmtDate(c.data)}</span>
                      {allPostos.length > 1 && (
                        <span className="text-muted-foreground">{c.posto_nome}</span>
                      )}
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-posto summary (only when multiple postos) */}
      {allPostos.length > 1 && (
        <div>
          <h2 className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-widest">
            Por Posto
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {postoSummaries.map((p) => (
              <Card
                key={p.posto_id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => goToResumo(p.posto_id)}
              >
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm truncate">{p.posto_nome}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </div>
                  <p className="text-base font-bold">{fmt(p.todayBrinks + p.todayManual)}</p>
                  <p className="text-[10px] text-muted-foreground mb-3">em {fmtDate(selectedDate)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 bg-green-50">
                      {p.okCount} OK
                    </Badge>
                    {p.pendenteCount > 0 && (
                      <Badge variant="outline" className="text-[10px] text-yellow-700 border-yellow-300 bg-yellow-50">
                        {p.pendenteCount} Pendente
                      </Badge>
                    )}
                    {p.divergenciaCount > 0 && (
                      <Badge variant="outline" className="text-[10px] text-red-700 border-red-300 bg-red-50">
                        {p.divergenciaCount} Divergência
                      </Badge>
                    )}
                    {p.semQualityCount > 0 && (
                      <Badge variant="outline" className="text-[10px] text-orange-700 border-orange-300 bg-orange-50">
                        {p.semQualityCount} sem PDF
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Últimas pendências / divergências */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
            Últimas Pendências / Divergências
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Carregando...</p>
          ) : pendingCaixas.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Nenhuma pendência ou divergência encontrada.
            </p>
          ) : (
            <div className="divide-y">
              {pendingCaixas.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={c.conferido === 'DIVERGÊNCIA' ? 'destructive' : 'secondary'}
                      className="text-[10px] shrink-0"
                    >
                      {c.conferido}
                    </Badge>
                    <div>
                      <p className="text-xs font-medium">
                        {fmtDate(c.data)}
                        {c.centro_custo ? ` — ${c.centro_custo}` : ''}
                      </p>
                      {allPostos.length > 1 && (
                        <p className="text-[10px] text-muted-foreground">{c.posto_nome}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => goToResumo(c.posto_id)}
                  >
                    Resolver <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
