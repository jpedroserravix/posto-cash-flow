import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const CARGOS = [
  'Auxiliar Administrativo',
  'Chefe de Pista',
  'Frentista',
  'Funcionário de Loja',
  'Gerente',
  'Repositor de Loja',
  'Secretária Administrativa',
  'Trocador de Óleo',
];

interface Curso {
  id: string;
  nome: string;
  descricao: string | null;
  validade_meses: number | null;
  obrigatorio: boolean;
  cargos_obrigatorios: string[];
}

interface FormData {
  nome: string;
  descricao: string;
  validade_meses: string;
  obrigatorio: boolean;
  cargos_obrigatorios: string[];
}

const EMPTY_FORM: FormData = {
  nome: '',
  descricao: '',
  validade_meses: '',
  obrigatorio: false,
  cargos_obrigatorios: [],
};

export default function Cursos() {
  const { role } = useAuth();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadCursos(); }, []);

  async function loadCursos() {
    setLoading(true);
    const { data, error } = await (supabase as any).from('cursos').select('*').order('nome');
    if (error) toast.error('Erro ao carregar cursos: ' + error.message);
    else setCursos(data ?? []);
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: Curso) {
    setEditingId(c.id);
    setForm({
      nome: c.nome,
      descricao: c.descricao ?? '',
      validade_meses: c.validade_meses?.toString() ?? '',
      obrigatorio: c.obrigatorio,
      cargos_obrigatorios: c.cargos_obrigatorios ?? [],
    });
    setDialogOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setSaving(true);

    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao.trim() || null,
      validade_meses: form.validade_meses ? parseInt(form.validade_meses) : null,
      obrigatorio: form.obrigatorio,
      cargos_obrigatorios: form.obrigatorio ? form.cargos_obrigatorios : [],
    };

    let error;
    if (editingId) {
      ({ error } = await (supabase as any).from('cursos').update(payload).eq('id', editingId));
    } else {
      ({ error } = await (supabase as any).from('cursos').insert(payload));
    }

    setSaving(false);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(editingId ? 'Curso atualizado' : 'Curso cadastrado');
    setDialogOpen(false);
    loadCursos();
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este curso? Os registros de treinamento dos funcionários serão removidos.')) return;
    const { error } = await (supabase as any).from('cursos').delete().eq('id', id);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Curso excluído'); loadCursos(); }
  }

  function toggleCargo(cargo: string) {
    setForm((f) => ({
      ...f,
      cargos_obrigatorios: f.cargos_obrigatorios.includes(cargo)
        ? f.cargos_obrigatorios.filter((c) => c !== cargo)
        : [...f.cargos_obrigatorios, cargo],
    }));
  }

  if (role !== 'admin') return <p className="text-center py-8 text-muted-foreground">Acesso restrito.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Cursos e Treinamentos</h1>
        <Button size="sm" onClick={openAdd} className="h-9">
          <Plus className="w-4 h-4 mr-1" />Novo Curso
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="text-xs">Validade</TableHead>
                <TableHead className="text-xs">Obrigatório</TableHead>
                <TableHead className="text-xs">Cargos</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">Carregando...</TableCell>
                </TableRow>
              )}
              {!loading && cursos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">Nenhum curso cadastrado.</TableCell>
                </TableRow>
              )}
              {cursos.map((c) => (
                <TableRow key={c.id} className="text-xs">
                  <TableCell>
                    <div className="font-medium">{c.nome}</div>
                    {c.descricao && <div className="text-muted-foreground text-[10px] mt-0.5">{c.descricao}</div>}
                  </TableCell>
                  <TableCell>
                    {c.validade_meses ? `${c.validade_meses} meses` : 'Não vence'}
                  </TableCell>
                  <TableCell>
                    {c.obrigatorio
                      ? <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-[10px]">Sim</Badge>
                      : <Badge variant="outline" className="text-[10px]">Não</Badge>
                    }
                  </TableCell>
                  <TableCell>
                    {c.obrigatorio && c.cargos_obrigatorios?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {c.cargos_obrigatorios.map((cargo) => (
                          <Badge key={cargo} variant="outline" className="text-[10px] py-0">{cargo}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)} title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id)} title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Curso' : 'Novo Curso'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do curso"
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição opcional"
                className="min-h-[60px] text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label>Validade (meses)</Label>
              <Input
                type="number"
                min={1}
                value={form.validade_meses}
                onChange={(e) => setForm((f) => ({ ...f, validade_meses: e.target.value }))}
                placeholder="Ex: 12, 24, 36 — deixe vazio se não vencer"
                className="h-9"
              />
            </div>
            <div className="flex items-center gap-2 py-1">
              <Switch
                id="obrigatorio"
                checked={form.obrigatorio}
                onCheckedChange={(v) => setForm((f) => ({ ...f, obrigatorio: v }))}
              />
              <Label htmlFor="obrigatorio" className="cursor-pointer">Obrigatório por cargo</Label>
            </div>
            {form.obrigatorio && (
              <div className="space-y-2 border rounded p-3 bg-muted/30">
                <Label className="text-xs text-muted-foreground">Cargos que precisam deste curso:</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {CARGOS.map((cargo) => (
                    <div key={cargo} className="flex items-center gap-2">
                      <Checkbox
                        id={`cargo-${cargo}`}
                        checked={form.cargos_obrigatorios.includes(cargo)}
                        onCheckedChange={() => toggleCargo(cargo)}
                      />
                      <label htmlFor={`cargo-${cargo}`} className="text-xs cursor-pointer">{cargo}</label>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
