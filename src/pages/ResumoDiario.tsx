import { useState, useEffect } from 'react';
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
      .eq('posto_id', selectedPostoId);

    const turnoMap = new Map<string, { brinks: number; manual: number }>();

    brinks?.forEach((b) => {
      if (!b.data_caixa || !b.turno) return;
      const cc = b.centro_custo || 'SEM CENTRO';
      const key = `${b.data_caixa}|${cc}|${b.turno}`;
      const existing = turnoMap.get(key) || { brinks: 0, manual: 0 };
      existing.brinks += b.valor;
      turnoMap.set(key, existing);
    });

    manuais?.forEach((m) => {
      const cc = m.centro_custo || 'SEM CENTRO';
      const key = `${m.data}|${cc}|${m.turno}`;
      const existing = turnoMap.get(key) || { brinks: 0, manual: 0 };
      existing.manual += m.valor_lancado;
      turnoMap.set(key, existing);
    });

    const groupMap = new Map<string, TurnoRow[]>();
    turnoMap.forEach((val, key) => {
      const [data, cc, turno] = key.split('|');
      const groupKey = `${data}|${cc}`;
      const arr = groupMap.get(groupKey) || [];
      arr.push({ turno, cofreBrinks: val.brinks, manual: val.manual, total: val.brinks + val.manual });
      groupMap.set(groupKey, arr);
    });

    const confMap = new Map<string, { conferido: string; observacao: string; id: string }>();
    conferencias?.forEach((c) => {
      const cc = c.centro_custo || 'SEM CENTRO';
      const key = `${c.data}|${cc}`;
      const existing = confMap.get(key);

      if (!existing || c.turno === null) {
        confMap.set(key, {
          conferido: c.conferido,
          observacao: c.observacao || '',
          id: c.id,
        });
      }
    });

    const result: GroupData[] = Array.from(groupMap.entries())
      .map(([key, turnos]) => {
        const [data, centroCusto] = key.split('|');
        const sorted = turnos.sort((a, b) => a.turno.localeCompare(b.turno));
        const totalBrinks = sorted.reduce((sum, turno) => sum + turno.cofreBrinks, 0);
        const totalManual = sorted.reduce((sum, turno) => sum + turno.manual, 0);
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
      })
      .sort((a, b) => b.data.localeCompare(a.data) || a.centroCusto.localeCompare(b.centroCusto));

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
      const { error } = await supabase
        .from('resumo_conferencia')
        .update({
          turno: null as string | null,
          centro_custo: payload.centro_custo,
          conferido: payload.conferido,
          observacao: payload.observacao,
        })
        .eq('id', group.resumoId);

      if (error) {
        toast.error('Erro: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('resumo_conferencia').insert(payload);

      if (error) {
        toast.error('Erro: ' + error.message);
        return;
      }
    }

    toast.success('Salvo');
    loadResumo();
  };

  const updateGroup = (index: number, field: 'conferido' | 'observacao', value: string) => {
    setGroups((prev) => prev.map((group, i) => (i === index ? { ...group, [field]: value } : group)));
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const borderColor = (status: string) => {
    if (status === 'OK') return 'border-l-4 border-l-success';
    if (status === 'DIVERGÊNCIA') return 'border-l-4 border-l-destructive';
    return 'border-l-4 border-l-warning';
  };

  if (!selectedPostoId) {
    return <p className="py-8 text-center text-muted-foreground">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Resumo Diário</h1>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-center text-sm text-muted-foreground">
              Nenhum dado para exibir. Importe depósitos Brinks ou cadastre depósitos manuais.
            </p>
          </CardContent>
        </Card>
      ) : (
        groups.map((group, i) => (
          <Card key={`${group.data}-${group.centroCusto}`} className={borderColor(group.conferido)}>
            <CardHeader className="px-4 pb-2 pt-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">
                  {new Date(`${group.data}T00:00:00`).toLocaleDateString('pt-BR')} — {group.centroCusto}
                </CardTitle>
                <span className="text-lg font-bold">{formatCurrency(group.totalGeral)}</span>
              </div>
            </CardHeader>

            <CardContent className="px-4 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Turno</TableHead>
                    <TableHead className="text-right text-xs">Cofre Brinks</TableHead>
                    <TableHead className="text-right text-xs">Manual</TableHead>
                    <TableHead className="text-right text-xs">Total</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {group.turnos.map((turno) => (
                    <TableRow key={turno.turno}>
                      <TableCell className="py-1 text-xs">{turno.turno}</TableCell>
                      <TableCell className="py-1 text-right text-xs">{formatCurrency(turno.cofreBrinks)}</TableCell>
                      <TableCell className="py-1 text-right text-xs">{formatCurrency(turno.manual)}</TableCell>
                      <TableCell className="py-1 text-right text-xs font-medium">{formatCurrency(turno.total)}</TableCell>
                    </TableRow>
                  ))}

                  <TableRow className="border-t-2">
                    <TableCell className="py-1 text-xs font-bold">Soma</TableCell>
                    <TableCell className="py-1 text-right text-xs font-bold">{formatCurrency(group.totalBrinks)}</TableCell>
                    <TableCell className="py-1 text-right text-xs font-bold">{formatCurrency(group.totalManual)}</TableCell>
                    <TableCell className="py-1 text-right text-xs font-bold">{formatCurrency(group.totalGeral)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>

            <CardFooter className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-1">
              <Select value={group.conferido} onValueChange={(value) => updateGroup(i, 'conferido', value)}>
                <SelectTrigger
                  className={`h-8 w-36 text-xs ${
                    group.conferido === 'OK'
                      ? 'border-success text-success'
                      : group.conferido === 'DIVERGÊNCIA'
                        ? 'border-destructive text-destructive'
                        : 'border-warning text-warning'
                  }`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFERIDO_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                className="h-8 min-w-[120px] flex-1 text-xs"
                value={group.observacao}
                onChange={(e) => updateGroup(i, 'observacao', e.target.value)}
                placeholder="Observação"
              />

              <Button size="sm" variant="ghost" onClick={() => handleSaveGroup(group)}>
                <Save className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}
