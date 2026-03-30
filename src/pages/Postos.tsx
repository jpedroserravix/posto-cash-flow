import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';

export default function Postos() {
  const { role } = useAuth();
  const [postos, setPostos] = useState<{ id: string; nome: string; cnpj: string }[]>([]);
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');

  useEffect(() => { loadPostos(); }, []);

  const loadPostos = async () => {
    const { data } = await supabase.from('postos').select('id, nome, cnpj').order('nome');
    setPostos(data || []);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !cnpj.trim()) return;
    const { error } = await supabase.from('postos').insert({ nome: nome.trim(), cnpj: cnpj.trim() });
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Posto cadastrado');
    setNome(''); setCnpj('');
    loadPostos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este posto e todos os dados relacionados?')) return;
    const { error } = await supabase.from('postos').delete().eq('id', id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Excluído'); loadPostos(); }
  };

  if (role !== 'admin') return <p className="text-center py-8 text-muted-foreground">Acesso restrito.</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Cadastro de Postos</h1>
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do posto" required className="h-9" />
            <Input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="CNPJ" required className="h-9 sm:w-48" />
            <Button type="submit" size="sm" className="h-9"><Plus className="w-4 h-4 mr-1" />Adicionar</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {postos.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell className="text-sm">{p.cnpj}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
