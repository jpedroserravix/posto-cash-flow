import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

export default function Usuarios() {
  const { role, allPostos } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('funcionario');
  const [selectedPosto, setSelectedPosto] = useState<string>('');
  const [loading, setLoading] = useState(false);

  if (role !== 'admin') return <p className="text-center py-8 text-muted-foreground">Acesso restrito.</p>;

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);

    // Create user via Supabase Auth admin (edge function needed for production)
    // For now, use signUp
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError || !signUpData.user) {
      toast.error('Erro ao criar usuário: ' + (signUpError?.message || 'Erro desconhecido'));
      setLoading(false);
      return;
    }

    const userId = signUpData.user.id;

    // Assign role
    const { error: roleError } = await supabase.from('user_roles').insert({
      user_id: userId,
      role: selectedRole as 'admin' | 'funcionario',
    });

    if (roleError) {
      toast.error('Erro ao atribuir papel: ' + roleError.message);
      setLoading(false);
      return;
    }

    // Assign posto if funcionario
    if (selectedRole === 'funcionario' && selectedPosto) {
      const { error: postoError } = await supabase.from('user_posto').insert({
        user_id: userId,
        posto_id: selectedPosto,
      });
      if (postoError) {
        toast.error('Erro ao vincular posto: ' + postoError.message);
      }
    }

    toast.success('Usuário criado com sucesso! Ele precisa confirmar o e-mail para acessar.');
    setEmail(''); setPassword('');
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Cadastro de Usuários</h1>
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleCreateUser} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">E-mail</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@email.com" required className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Senha</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha" required minLength={6} className="h-9" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Perfil</label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="funcionario">Funcionário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedRole === 'funcionario' && (
                <div>
                  <label className="text-xs font-medium mb-1 block">Posto</label>
                  <Select value={selectedPosto} onValueChange={setSelectedPosto}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecionar posto" /></SelectTrigger>
                    <SelectContent>
                      {allPostos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Button type="submit" disabled={loading} size="sm">
              <UserPlus className="w-4 h-4 mr-1" />
              {loading ? 'Criando...' : 'Criar Usuário'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
