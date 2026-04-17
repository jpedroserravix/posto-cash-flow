import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil } from 'lucide-react';

interface ContaBancaria {
  id: string;
  posto_id: string;
  banco: string;
  agencia: string;
  conta: string;
}

const EMPTY_FORM = { banco: '', agencia: '', conta: '', posto_id: '' };

export default function ContasBancarias() {
  const { selectedPostoId, allPostos, role, postoId, postoNome } = useAuth();
  const isAdmin = role === 'admin';

  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [postoFilter, setPostoFilter] = useState('todos');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Build list of posto options for selectors/display
  const postoOptions =
    allPostos.length > 0
      ? allPostos
      : postoId && postoNome
      ? [{ id: postoId, nome: postoNome, cnpj: '' }]
      : [];
  const postoMap = new Map(postoOptions.map((p) => [p.id, p.nome]));

  useEffect(() => {
    loadContas();
  }, [selectedPostoId, isAdmin]);

  const loadContas = async () => {
    let q = supabase.from('contas_bancarias').select('*').order('banco');
    if (!isAdmin) {
      if (!selectedPostoId) return;
      q = (q as any).eq('posto_id', selectedPostoId);
    }
    const { data } = await (q as any);
    setContas((data as ContaBancaria[]) || []);
  };

  const displayContas =
    isAdmin && postoFilter !== 'todos'
      ? contas.filter((c) => c.posto_id === postoFilter)
      : contas;

  const showPostoCol = isAdmin || postoOptions.length > 1;

  const openAdd = () => {
    setEditingId(null);
    const defaultPosto = isAdmin
      ? selectedPostoId || postoOptions[0]?.id || ''
      : selectedPostoId || '';
    setForm({ ...EMPTY_FORM, posto_id: defaultPosto });
    setDialogOpen(true);
  };

  const openEdit = (c: ContaBancaria) => {
    setEditingId(c.id);
    setForm({ banco: c.banco, agencia: c.agencia, conta: c.conta, posto_id: c.posto_id });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.banco.trim() || !form.agencia.trim() || !form.conta.trim() || !form.posto_id) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    setSaving(true);
    const payload = {
      banco: form.banco.trim(),
      agencia: form.agencia.trim(),
      conta: form.conta.trim(),
      posto_id: form.posto_id,
    };

    if (editingId) {
      const { error } = await supabase
        .from('contas_bancarias')
        .update(payload)
        .eq('id', editingId);
      if (error) toast.error('Erro ao salvar: ' + error.message);
      else {
        toast.success('Conta atualizada');
        setDialogOpen(false);
        loadContas();
      }
    } else {
      const { error } = await supabase.from('contas_bancarias').insert(payload);
      if (error) toast.error('Erro ao adicionar: ' + error.message);
      else {
        toast.success('Conta bancária adicionada');
        setDialogOpen(false);
        loadContas();
      }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('contas_bancarias').delete().eq('id', id);
    if (error) toast.error('Erro ao excluir: ' + error.message);
    else {
      toast.success('Conta removida');
      loadContas();
    }
  };

  if (!isAdmin && !selectedPostoId) {
    return (
      <p className="text-muted-foreground text-center py-8">
        Selecione um posto para continuar.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">Contas Bancárias</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && postoOptions.length > 1 && (
            <Select value={postoFilter} onValueChange={setPostoFilter}>
              <SelectTrigger className="h-9 text-sm w-[180px]">
                <SelectValue placeholder="Filtrar por posto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os postos</SelectItem>
                {postoOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1" />
            Adicionar
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {displayContas.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">
              Nenhuma conta cadastrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {showPostoCol && <TableHead>Posto</TableHead>}
                  <TableHead>Banco</TableHead>
                  <TableHead>Agência</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayContas.map((c) => (
                  <TableRow key={c.id}>
                    {showPostoCol && (
                      <TableCell className="text-sm">
                        {postoMap.get(c.posto_id) || c.posto_id}
                      </TableCell>
                    )}
                    <TableCell>{c.banco}</TableCell>
                    <TableCell>{c.agencia}</TableCell>
                    <TableCell>{c.conta}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar Conta Bancária' : 'Adicionar Conta Bancária'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Posto selector — admins only */}
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>
                  Posto vinculado <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.posto_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, posto_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar posto" />
                  </SelectTrigger>
                  <SelectContent>
                    {postoOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>
                Banco <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.banco}
                onChange={(e) => setForm((f) => ({ ...f, banco: e.target.value }))}
                placeholder="Ex: Sicredi"
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Agência <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.agencia}
                onChange={(e) => setForm((f) => ({ ...f, agencia: e.target.value }))}
                placeholder="0001"
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Conta <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.conta}
                onChange={(e) => setForm((f) => ({ ...f, conta: e.target.value }))}
                placeholder="00000-0"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
