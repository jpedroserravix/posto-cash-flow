import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { ObsTooltip } from '@/components/ObsTooltip';

interface Posto {
  id: string;
  nome: string;
  cnpj: string;
  inscricao_estadual: string | null;
  endereco: string | null;
  email: string | null;
}

interface FormData {
  nome: string;
  cnpj: string;
  inscricao_estadual: string;
  endereco: string;
  email: string;
}

const EMPTY_FORM: FormData = { nome: '', cnpj: '', inscricao_estadual: '', endereco: '', email: '' };

export default function Postos() {
  const { role } = useAuth();
  const [postos, setPostos] = useState<Posto[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadPostos(); }, []);

  const loadPostos = async () => {
    const { data } = await supabase
      .from('postos')
      .select('id, nome, cnpj, inscricao_estadual, endereco, email')
      .order('nome');
    setPostos((data || []) as Posto[]);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (p: Posto) => {
    setEditingId(p.id);
    setForm({
      nome: p.nome,
      cnpj: p.cnpj || '',
      inscricao_estadual: p.inscricao_estadual || '',
      endereco: p.endereco || '',
      email: p.email || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.cnpj.trim()) return;
    setSaving(true);

    const payload = {
      nome: form.nome.trim(),
      cnpj: form.cnpj.trim(),
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      endereco: form.endereco.trim() || null,
      email: form.email.trim() || null,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from('postos').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('postos').insert(payload));
    }

    setSaving(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(editingId ? 'Posto atualizado' : 'Posto cadastrado');
    setDialogOpen(false);
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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cadastro de Postos</h1>
        <Button size="sm" onClick={openAdd} className="h-9">
          <Plus className="w-4 h-4 mr-1" />Novo Posto
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="hidden md:table-cell">Insc. Estadual</TableHead>
                <TableHead className="hidden lg:table-cell">Endereço</TableHead>
                <TableHead className="hidden lg:table-cell">E-mail</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {postos.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nome}</TableCell>
                  <TableCell className="text-sm">{p.cnpj}</TableCell>
                  <TableCell className="text-sm hidden md:table-cell">{p.inscricao_estadual || '—'}</TableCell>
                  <TableCell className="text-sm hidden lg:table-cell max-w-[200px]">
                    <ObsTooltip text={p.endereco} maxWidth="max-w-[200px]" />
                  </TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">{p.email || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)} title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {postos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum posto cadastrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Posto' : 'Novo Posto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do posto"
                required
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>CNPJ *</Label>
                <Input
                  value={form.cnpj}
                  onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                  required
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label>Inscrição Estadual</Label>
                <Input
                  value={form.inscricao_estadual}
                  onChange={e => setForm(f => ({ ...f, inscricao_estadual: e.target.value }))}
                  placeholder="000.000.000.000"
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Endereço</Label>
              <Input
                value={form.endereco}
                onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                placeholder="Rua, número, bairro, cidade - UF"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@posto.com.br"
                className="h-9"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? 'Salvando...' : (editingId ? 'Salvar' : 'Adicionar')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
