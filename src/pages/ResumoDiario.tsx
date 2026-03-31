import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Save } from 'lucide-react';

const CONFERIDO_OPTIONS = ['OK', 'PENDENTE', 'DIVERGÊNCIA'];

interface ResumoRow {
  data: string;
  turno: string;
  centroCusto: string;
  cofreBrinks: number;
  manual: number;
  total: number;
  conferido: string;
  observacao: string;
  resumoId?: string;
}

export default function ResumoDiario() {
  const { selectedPostoId } = useAuth();
  const [rows, setRows] = useState<ResumoRow[]>([]);

  useEffect(() => {
    if (selectedPostoId) loadResumo();
  }, [selectedPostoId]);

  const loadResumo = async () => {
    if (!selectedPostoId) return;

    // Get brinks deposits grouped by data_caixa + turno
    const { data: brinks } = await supabase
      .from('depositos_brinks')
      .select('data_caixa, turno, valor, centro_custo')
      .eq('posto_id', selectedPostoId)
      .not('data_caixa', 'is', null)
      .not('turno', 'is', null);

    // Get manual deposits grouped by data + turno + centro_custo
    const { data: manuais } = await supabase
      .from('depositos_manuais')
      .select('data, turno, valor_lancado, centro_custo')
      .eq('posto_id', selectedPostoId);

    // Get existing conference records
    const { data: conferencias } = await supabase
      .from('resumo_conferencia')
      .select('*')
      .eq('posto_id', selectedPostoId);

    // Group by data|turno|centro_custo
    const map = new Map<string, { brinks: number; manual: number; conferido: string; observacao: string; resumoId?: string }>();

    brinks?.forEach(b => {
      if (!b.data_caixa || !b.turno) return;
      const cc = (b as any).centro_custo || 'SEM CENTRO';
      const key = `${b.data_caixa}|${b.turno}|${cc}`;
      const existing = map.get(key) || { brinks: 0, manual: 0, conferido: 'PENDENTE', observacao: '', resumoId: undefined };
      existing.brinks += b.valor;
      map.set(key, existing);
    });

    manuais?.forEach(m => {
      const cc = (m as any).centro_custo || 'SEM CENTRO';
      const key = `${m.data}|${m.turno}|${cc}`;
      const existing = map.get(key) || { brinks: 0, manual: 0, conferido: 'PENDENTE', observacao: '', resumoId: undefined };
      existing.manual += m.valor_lancado;
      map.set(key, existing);
    });

    // Merge conference data
    conferencias?.forEach(c => {
      const cc = (c as any).centro_custo || 'SEM CENTRO';
      const key = `${c.data}|${c.turno}|${cc}`;
      const existing = map.get(key);
      if (existing) {
        existing.conferido = c.conferido;
        existing.observacao = c.observacao || '';
        existing.resumoId = c.id;
      }
    });

    const result: ResumoRow[] = Array.from(map.entries())
      .map(([key, val]) => {
        const [data, turno, centroCusto] = key.split('|');
        return {
          data,
          turno,
          centroCusto: centroCusto || '',
          cofreBrinks: val.brinks,
          manual: val.manual,
          total: val.brinks + val.manual,
          conferido: val.conferido,
          observacao: val.observacao,
          resumoId: val.resumoId,
        };
      })
      .sort((a, b) => b.data.localeCompare(a.data) || a.turno.localeCompare(b.turno));

    setRows(result);
  };

  const handleSaveRow = async (row: ResumoRow) => {
    if (!selectedPostoId) return;

    if (row.resumoId) {
      const { error } = await supabase.from('resumo_conferencia')
        .update({ conferido: row.conferido, observacao: row.observacao || null })
        .eq('id', row.resumoId);
      if (error) { toast.error('Erro: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('resumo_conferencia')
        .insert({
          posto_id: selectedPostoId,
          data: row.data,
          turno: row.turno,
          conferido: row.conferido,
          observacao: row.observacao || null,
        });
      if (error) { toast.error('Erro: ' + error.message); return; }
    }
    toast.success('Salvo');
    loadResumo();
  };

  const updateRow = (index: number, field: 'conferido' | 'observacao', value: string) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (!selectedPostoId) {
    return <p className="text-muted-foreground text-center py-8">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Resumo Diário</h1>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">Nenhum dado para exibir. Importe depósitos Brinks ou cadastre depósitos manuais.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead className="text-right">Cofre Brinks</TableHead>
                  <TableHead className="text-right">Manual</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Conferido</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={`${row.data}-${row.turno}`}>
                    <TableCell className="text-xs">{new Date(row.data + 'T00:00:00').toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-xs">{row.turno}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatCurrency(row.cofreBrinks)}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatCurrency(row.manual)}</TableCell>
                    <TableCell className="text-right text-xs font-bold">{formatCurrency(row.total)}</TableCell>
                    <TableCell>
                      <Select value={row.conferido} onValueChange={v => updateRow(i, 'conferido', v)}>
                        <SelectTrigger className={`h-8 text-xs w-32 ${
                          row.conferido === 'OK' ? 'border-success text-success' :
                          row.conferido === 'DIVERGÊNCIA' ? 'border-destructive text-destructive' :
                          'border-warning text-warning'
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONFERIDO_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-8 text-xs w-40"
                        value={row.observacao}
                        onChange={e => updateRow(i, 'observacao', e.target.value)}
                        placeholder="Observação"
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => handleSaveRow(row)}>
                        <Save className="w-3 h-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
