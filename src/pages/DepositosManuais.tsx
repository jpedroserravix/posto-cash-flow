import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';

const TURNOS = ['TURNO 1', 'TURNO 2', 'TURNO 3'];

interface ManualDeposit {
  id: string;
  data: string;
  turno: string;
  valor_lancado: number;
  valor_depositado: number | null;
  observacao: string | null;
}

export default function DepositosManuais() {
  const { selectedPostoId } = useAuth();
  const [deposits, setDeposits] = useState<ManualDeposit[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({ data: '', turno: '', valor_lancado: '', valor_depositado: '', observacao: '' });

  useEffect(() => {
    if (selectedPostoId) loadDeposits();
  }, [selectedPostoId]);

  const loadDeposits = async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('depositos_manuais')
      .select('*')
      .eq('posto_id', selectedPostoId)
      .order('data', { ascending: true })
      .order('created_at', { ascending: true });
    setDeposits(data || []);
  };

  const parseMoney = (v: string) => {
    if (!v.trim()) return null;
    const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPostoId) return;

    const valorLancado = parseMoney(formData.valor_lancado);
    if (valorLancado === null) { toast.error('Informe o valor lançado'); return; }

    const record = {
      posto_id: selectedPostoId,
      data: formData.data,
      turno: formData.turno,
      valor_lancado: valorLancado,
      valor_depositado: parseMoney(formData.valor_depositado),
      observacao: formData.observacao || null,
    };

    if (editingId) {
      const { error } = await supabase.from('depositos_manuais').update(record).eq('id', editingId);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Atualizado');
      setEditingId(null);
    } else {
      const { error } = await supabase.from('depositos_manuais').insert(record);
      if (error) { toast.error('Erro: ' + error.message); return; }
      toast.success('Lançamento adicionado');
    }

    setFormData({ data: '', turno: '', valor_lancado: '', valor_depositado: '', observacao: '' });
    setShowForm(false);
    loadDeposits();
  };

  const handleEdit = (d: ManualDeposit) => {
    setEditingId(d.id);
    setFormData({
      data: d.data,
      turno: d.turno,
      valor_lancado: d.valor_lancado.toString(),
      valor_depositado: d.valor_depositado?.toString() || '',
      observacao: d.observacao || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return;
    const { error } = await supabase.from('depositos_manuais').delete().eq('id', id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Excluído'); loadDeposits(); }
  };

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Calculate running balance
  let saldoAcumulado = 0;
  const depositsWithSaldo = deposits.map(d => {
    saldoAcumulado += d.valor_lancado - (d.valor_depositado || 0);
    return { ...d, saldo: saldoAcumulado };
  });

  if (!selectedPostoId) {
    return <p className="text-muted-foreground text-center py-8">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <h1 className="text-xl font-bold">Depósitos Manuais</h1>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ data: '', turno: '', valor_lancado: '', valor_depositado: '', observacao: '' }); }}>
          {showForm ? <><X className="w-4 h-4 mr-1" />Cancelar</> : <><Plus className="w-4 h-4 mr-1" />Novo Lançamento</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Data</label>
                <Input type="date" value={formData.data} onChange={e => setFormData({ ...formData, data: e.target.value })} required className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Turno</label>
                <Select value={formData.turno} onValueChange={v => setFormData({ ...formData, turno: v })}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Turno" /></SelectTrigger>
                  <SelectContent>{TURNOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Valor Lançado (R$)</label>
                <Input value={formData.valor_lancado} onChange={e => setFormData({ ...formData, valor_lancado: e.target.value })} placeholder="0,00" required className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Valor Depositado (R$)</label>
                <Input value={formData.valor_depositado} onChange={e => setFormData({ ...formData, valor_depositado: e.target.value })} placeholder="0,00" className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Observação</label>
                <div className="flex gap-2">
                  <Input value={formData.observacao} onChange={e => setFormData({ ...formData, observacao: e.target.value })} placeholder="Ex: SICREDI/JP" className="h-9" />
                  <Button type="submit" size="sm" className="h-9 px-3">
                    <Save className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          {depositsWithSaldo.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">Nenhum lançamento manual ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Turno</TableHead>
                  <TableHead className="text-right">Valor Lançado</TableHead>
                  <TableHead className="text-right">Valor Depositado</TableHead>
                  <TableHead className="text-right">Saldo Pendente</TableHead>
                  <TableHead>Observação</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depositsWithSaldo.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">{new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-xs">{d.turno}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{formatCurrency(d.valor_lancado)}</TableCell>
                    <TableCell className="text-right text-xs">{d.valor_depositado ? formatCurrency(d.valor_depositado) : '—'}</TableCell>
                    <TableCell className={`text-right text-xs font-bold ${
                      d.saldo === 0 ? 'text-success' : d.saldo > 0 ? 'text-warning' : 'text-destructive'
                    }`}>
                      {formatCurrency(d.saldo)}
                    </TableCell>
                    <TableCell className="text-xs">{d.observacao || ''}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(d)}><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(d.id)}><Trash2 className="w-3 h-3" /></Button>
                      </div>
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
