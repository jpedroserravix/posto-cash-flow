import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

const CONFERIDO_OPTIONS = ['OK', 'PENDENTE', 'DIVERGÊNCIA'];

interface TurnoRow {
  turno: string;
  cofreBrinks: number;
  manual: number;
  total: number;
}

interface GroupData {
  data: string;
  centroCusto: string;
  turnos: TurnoRow[];
  totalBrinks: number;
  totalManual: number;
  totalGeral: number;
  conferido: string;
  observacao: string;
  resumoId?: string;
}

export default function ResumoDiario() {
  const { selectedPostoId } = useAuth();
  const [groups, setGroups] = useState<GroupData[]>([]);

  useEffect(() => {
    if (selectedPostoId) loadResumo();
  }, [selectedPostoId]);

  const loadResumo = async () => {
    if (!selectedPostoId) return;

    const { data: brinks } = await supabase
      .from('depositos_brinks')
      .select('data_caixa, turno, valor, centro_custo')
      .eq('posto_id', selectedPostoId)
      .not('data_caixa', 'is', null)
      .not('turno', 'is', null);

    const { data: manuais } = await supabase
      .from('depositos_manuais')
      .select('data, turno, valor_lancado, centro_custo')
      .eq('posto_id', selectedPostoId);

    const { data: conferencias } = await supabase
      .from('resumo_conferencia')
      .select('*')
      .eq('posto_id', selectedPostoId)
      .is('turno', null);

    // Build turno-level map: key = data|centroCusto|turno
    const turnoMap = new Map<string, { brinks: number; manual: number }>();

    brinks?.forEach(b => {
      if (!b.data_caixa || !b.turno) return;
      const cc = b.centro_custo || 'SEM CENTRO';
      const key = `${b.data_caixa}|${cc}|${b.turno}`;
      const existing = turnoMap.get(key) || { brinks: 0, manual: 0 };
      existing.brinks += b.valor;
      turnoMap.set(key, existing);
    });

    manuais?.forEach(m => {
      const cc = m.centro_custo || 'SEM CENTRO';
      const key = `${m.data}|${cc}|${m.turno}`;
      const existing = turnoMap.get(key) || { brinks: 0, manual: 0 };
      existing.manual += m.valor_lancado;
      turnoMap.set(key, existing);
    });

    // Group by data|centroCusto
    const groupMap = new Map<string, TurnoRow[]>();
    turnoMap.forEach((val, key) => {
      const [data, cc, turno] = key.split('|');
      const groupKey = `${data}|${cc}`;
      const arr = groupMap.get(groupKey) || [];
      arr.push({ turno, cofreBrinks: val.brinks, manual: val.manual, total: val.brinks + val.manual });
      groupMap.set(groupKey, arr);
    });

    // Build conference lookup: key = data|centroCusto
    const confMap = new Map<string, { conferido: string; observacao: string; id: string }>();
    conferencias?.forEach(c => {
      const cc = c.centro_custo || 'SEM CENTRO';
      confMap.set(`${c.data}|${cc}`, { conferido: c.conferido, observacao: c.observacao || '', id: c.id });
    });

    const result: GroupData[] = Array.from(groupMap.entries()).map(([key, turnos]) => {
      const [data, centroCusto] = key.split('|');
      const sorted = turnos.sort((a, b) => a.turno.localeCompare(b.turno));
      const totalBrinks = sorted.reduce((s, t) => s + t.cofreBrinks, 0);
      const totalManual = sorted.reduce((s, t) => s + t.manual, 0);
      const conf = confMap.get(key);
      return {
        data,
        centroCusto,
        turnos: sorted,
        totalBrinks,
        totalManual,
        totalGeral: totalBrinks + totalManual,
        conferido: conf?.conferido || 'PENDENTE',
        observacao: conf?.observacao || '',
        resumoId: conf?.id,
      };
    }).sort((a, b) => b.data.localeCompare(a.data) || a.centroCusto.localeCompare(b.centroCusto));

    setGroups(result);
  };

  const handleSaveGroup = async (group: GroupData) => {
    if (!selectedPostoId) return;

    const payload = {
      posto_id: selectedPostoId,
      data: group.data,
      turno: null as string | null,
      centro_custo: group.centroCusto === 'SEM CENTRO' ? null : group.centroCusto,
      conferido: group.conferido,
      observacao: group.observacao || null,
    };

    if (group.resumoId) {
      const { error } = await supabase.from('resumo_conferencia')
        .update({ conferido: payload.conferido, observacao: payload.observacao })
        .eq('id', group.resumoId);
      if (error) { toast.error('Erro: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('resumo_conferencia')
        .insert(payload);
      if (error) { toast.error('Erro: ' + error.message); return; }
    }
    toast.success('Salvo');
    loadResumo();
  };

  const updateGroup = (index: number, field: 'conferido' | 'observacao', value: string) => {
    setGroups(prev => prev.map((g, i) => i === index ? { ...g, [field]: value } : g));
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const borderColor = (status: string) => {
    if (status === 'OK') return 'border-l-4 border-l-green-500';
    if (status === 'DIVERGÊNCIA') return 'border-l-4 border-l-destructive';
    return 'border-l-4 border-l-yellow-500';
  };

  if (!selectedPostoId) {
    return <p className="text-muted-foreground text-center py-8">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Resumo Diário</h1>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-muted-foreground text-center text-sm">Nenhum dado para exibir. Importe depósitos Brinks ou cadastre depósitos manuais.</p>
          </CardContent>
        </Card>
      ) : (
        groups.map((group, i) => (
          <Card key={`${group.data}-${group.centroCusto}`} className={borderColor(group.conferido)}>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {new Date(group.data + 'T00:00:00').toLocaleDateString('pt-BR')} — {group.centroCusto}
                </CardTitle>
                <span className="text-lg font-bold">{formatCurrency(group.totalGeral)}</span>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Turno</TableHead>
                    <TableHead className="text-xs text-right">Cofre Brinks</TableHead>
                    <TableHead className="text-xs text-right">Manual</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.turnos.map(t => (
                    <TableRow key={t.turno}>
                      <TableCell className="text-xs py-1">{t.turno}</TableCell>
                      <TableCell className="text-xs text-right py-1">{formatCurrency(t.cofreBrinks)}</TableCell>
                      <TableCell className="text-xs text-right py-1">{formatCurrency(t.manual)}</TableCell>
                      <TableCell className="text-xs text-right py-1 font-medium">{formatCurrency(t.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="text-xs font-bold py-1">Soma</TableCell>
                    <TableCell className="text-xs text-right font-bold py-1">{formatCurrency(group.totalBrinks)}</TableCell>
                    <TableCell className="text-xs text-right font-bold py-1">{formatCurrency(group.totalManual)}</TableCell>
                    <TableCell className="text-xs text-right font-bold py-1">{formatCurrency(group.totalGeral)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="px-4 pb-3 pt-1 flex items-center gap-2 flex-wrap">
              <Select value={group.conferido} onValueChange={v => updateGroup(i, 'conferido', v)}>
                <SelectTrigger className={`h-8 text-xs w-36 ${
                  group.conferido === 'OK' ? 'border-green-500 text-green-600' :
                  group.conferido === 'DIVERGÊNCIA' ? 'border-destructive text-destructive' :
                  'border-yellow-500 text-yellow-600'
                }`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFERIDO_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="h-8 text-xs flex-1 min-w-[120px]"
                value={group.observacao}
                onChange={e => updateGroup(i, 'observacao', e.target.value)}
                placeholder="Observação"
              />
              <Button size="sm" variant="ghost" onClick={() => handleSaveGroup(group)}>
                <Save className="w-4 h-4" />
              </Button>
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}
