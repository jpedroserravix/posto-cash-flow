import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

interface ContaBancaria {
  id: string;
  posto_id: string;
  banco: string;
  agencia: string;
  conta: string;
}

export default function ContasBancarias() {
  const { selectedPostoId } = useAuth();
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedPostoId) loadContas();
  }, [selectedPostoId]);

  const loadContas = async () => {
    if (!selectedPostoId) return;
    const { data } = await supabase
      .from('contas_bancarias')
      .select('*')
      .eq('posto_id', selectedPostoId)
      .order('banco');
    setContas((data as ContaBancaria[]) || []);
  };

  const handleAdd = async () => {
    if (!selectedPostoId || !banco.trim() || !agencia.trim() || !conta.trim()) {
      toast.error('Preencha todos os campos');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('contas_bancarias').insert({
      posto_id: selectedPostoId,
      banco: banco.trim(),
      agencia: agencia.trim(),
      conta: conta.trim(),
    });
    if (error) {
      toast.error('Erro ao adicionar: ' + error.message);
    } else {
      toast.success('Conta bancária adicionada');
      setBanco('');
      setAgencia('');
      setConta('');
      loadContas();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('contas_bancarias').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir: ' + error.message);
    } else {
      toast.success('Conta removida');
      loadContas();
    }
  };

  if (!selectedPostoId) {
    return <p className="text-muted-foreground text-center py-8">Selecione um posto para continuar.</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Contas Bancárias</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar Conta</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input placeholder="Banco (ex: Sicredi)" value={banco} onChange={e => setBanco(e.target.value)} />
            <Input placeholder="Agência" value={agencia} onChange={e => setAgencia(e.target.value)} />
            <Input placeholder="Conta" value={conta} onChange={e => setConta(e.target.value)} />
            <Button onClick={handleAdd} disabled={loading} className="whitespace-nowrap">
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {contas.length === 0 ? (
            <p className="text-muted-foreground text-center py-6 text-sm">Nenhuma conta cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banco</TableHead>
                  <TableHead>Agência</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contas.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>{c.banco}</TableCell>
                    <TableCell>{c.agencia}</TableCell>
                    <TableCell>{c.conta}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
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
