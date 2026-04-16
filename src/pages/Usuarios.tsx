import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { UserPlus, Pencil, Trash2, X, Save, UserX, UserCheck } from 'lucide-react';
import { ALL_PERMISSIONS, PROFILE_PRESETS } from '@/lib/permissions';

// Temporary client that won't overwrite the admin's session
const tempClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

interface UserProfile {
  id: string;
  user_id: string;
  nome: string;
  username: string;
  perfil: string;
  posto_ids: string[];
  permissoes: string[];
  ativo: boolean;
}

const PERFIS = [
  { value: 'admin',     label: 'Administrador' },
  { value: 'gerente',   label: 'Gerente' },
  { value: 'frentista', label: 'Frentista' },
];

const emptyForm = {
  nome: '',
  username: '',
  senha: '',
  perfil: 'frentista',
  posto_ids: [] as string[],
  permissoes: PROFILE_PRESETS.frentista as string[],
};

export default function Usuarios() {
  const { role } = useAuth();
  const [users, setUsers]     = useState<UserProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [saving, setSaving]   = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [postos, setPostos]   = useState<{ id: string; nome: string }[]>([]);

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_profiles' as any)
      .select('id, user_id, nome, username, perfil, posto_ids, permissoes, ativo')
      .order('nome');
    if (!error) setUsers((data as UserProfile[]) || []);
  }, []);

  const loadPostos = useCallback(async () => {
    const { data } = await supabase.from('postos').select('id, nome').order('nome');
    setPostos(data || []);
  }, []);

  useEffect(() => { loadUsers(); loadPostos(); }, [loadUsers, loadPostos]);

  if (role !== 'admin') {
    return <p className="text-center py-8 text-muted-foreground">Acesso restrito.</p>;
  }

  // --- Form helpers ---

  const handlePerfilChange = (perfil: string) => {
    setFormData((prev) => ({ ...prev, perfil, permissoes: PROFILE_PRESETS[perfil] ?? [] }));
  };

  const togglePermission = (key: string) => {
    setFormData((prev) => ({
      ...prev,
      permissoes: prev.permissoes.includes(key)
        ? prev.permissoes.filter((p) => p !== key)
        : [...prev.permissoes, key],
    }));
  };

  const togglePosto = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      posto_ids: prev.posto_ids.includes(id)
        ? prev.posto_ids.filter((p) => p !== id)
        : [...prev.posto_ids, id],
    }));
  };

  const openNewForm = () => {
    setEditingId(null);
    setFormData({ ...emptyForm });
    setShowForm(true);
  };

  const openEditForm = (u: UserProfile) => {
    setEditingId(u.id);
    setFormData({
      nome: u.nome,
      username: u.username,
      senha: '',
      perfil: u.perfil,
      posto_ids: u.posto_ids ?? [],
      permissoes: u.permissoes ?? [],
    });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ ...emptyForm });
  };

  // --- CRUD ---

  const syncUserPosto = async (userId: string, postoIds: string[]) => {
    await supabase.from('user_posto').delete().eq('user_id', userId);
    if (postoIds.length > 0) {
      await supabase.from('user_posto').insert(
        postoIds.map((posto_id) => ({ user_id: userId, posto_id }))
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || !formData.username.trim()) {
      toast.error('Nome e usuário são obrigatórios.');
      return;
    }

    setSaving(true);

    if (editingId) {
      const existing = users.find((u) => u.id === editingId)!;

      const { error } = await supabase
        .from('user_profiles' as any)
        .update({
          nome: formData.nome,
          username: formData.username,
          perfil: formData.perfil,
          posto_ids: formData.posto_ids,
          permissoes: formData.permissoes,
        })
        .eq('id', editingId);

      if (error) { toast.error('Erro ao atualizar: ' + error.message); setSaving(false); return; }

      const newRole = formData.perfil === 'admin' ? 'admin' : 'funcionario';
      await supabase.from('user_roles').upsert({ user_id: existing.user_id, role: newRole }, { onConflict: 'user_id' });
      await syncUserPosto(existing.user_id, formData.posto_ids);

      if (formData.senha.trim()) {
        toast.info('Senha não alterada — use o painel do Supabase para redefinir senhas.');
      }

      toast.success('Usuário atualizado.');
      cancelForm();
      loadUsers();
    } else {
      if (!formData.senha.trim() || formData.senha.length < 6) {
        toast.error('Senha deve ter pelo menos 6 caracteres.');
        setSaving(false);
        return;
      }

      const email = `${formData.username.trim()}@posto.app`;

      const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({ email, password: formData.senha });

      if (signUpError || !signUpData.user) {
        toast.error('Erro ao criar usuário: ' + (signUpError?.message || 'Erro desconhecido'));
        setSaving(false);
        return;
      }

      const userId = signUpData.user.id;

      const { error: profileError } = await supabase
        .from('user_profiles' as any)
        .insert({
          user_id: userId,
          nome: formData.nome,
          username: formData.username.trim(),
          perfil: formData.perfil,
          posto_ids: formData.posto_ids,
          permissoes: formData.permissoes,
          ativo: true,
        });

      if (profileError) { toast.error('Erro ao salvar perfil: ' + profileError.message); setSaving(false); return; }

      const newRole = formData.perfil === 'admin' ? 'admin' : 'funcionario';
      await supabase.from('user_roles').insert({ user_id: userId, role: newRole });
      await syncUserPosto(userId, formData.posto_ids);

      toast.success('Usuário criado com sucesso!');
      cancelForm();
      loadUsers();
    }

    setSaving(false);
  };

  const handleToggleAtivo = async (u: UserProfile) => {
    const { error } = await supabase.from('user_profiles' as any).update({ ativo: !u.ativo }).eq('id', u.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success(u.ativo ? 'Usuário desativado.' : 'Usuário reativado.');
    loadUsers();
  };

  const handleDelete = async (u: UserProfile) => {
    await supabase.from('user_posto').delete().eq('user_id', u.user_id);
    await supabase.from('user_roles').delete().eq('user_id', u.user_id);
    const { error } = await supabase.from('user_profiles' as any).delete().eq('id', u.id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Usuário removido.');
    setDeletingId(null);
    loadUsers();
  };

  const postoNames = (ids: string[]) =>
    ids.length === 0
      ? '—'
      : ids.map((id) => postos.find((p) => p.id === id)?.nome ?? id).join(', ');

  const perfilLabel = (p: string) => PERFIS.find((x) => x.value === p)?.label ?? p;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Usuários</h1>
        {!showForm && (
          <Button size="sm" onClick={openNewForm}>
            <UserPlus className="w-4 h-4 mr-1" />
            Novo Usuário
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <Card>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-semibold">{editingId ? 'Editar Usuário' : 'Novo Usuário'}</h2>
                <button type="button" onClick={cancelForm}>
                  <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                </button>
              </div>

              {/* Basic fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">Nome completo</Label>
                  <Input
                    value={formData.nome}
                    onChange={(e) => setFormData((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Ex: João da Silva"
                    className="h-9"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">Usuário (login)</Label>
                  <Input
                    value={formData.username}
                    onChange={(e) => setFormData((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                    placeholder="Ex: joao.silva"
                    className="h-9"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs mb-1 block">
                    Senha {editingId && <span className="font-normal text-muted-foreground">(deixe em branco para manter)</span>}
                  </Label>
                  <Input
                    type="password"
                    value={formData.senha}
                    onChange={(e) => setFormData((p) => ({ ...p, senha: e.target.value }))}
                    placeholder="••••••••"
                    className="h-9 max-w-xs"
                    minLength={editingId ? 0 : 6}
                    required={!editingId}
                  />
                </div>
              </div>

              {/* Postos — multi-select */}
              <div>
                <Label className="text-xs mb-2 block">
                  Postos vinculados
                  {formData.posto_ids.length > 0 && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({formData.posto_ids.length} selecionado{formData.posto_ids.length > 1 ? 's' : ''})
                    </span>
                  )}
                </Label>
                {postos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum posto cadastrado.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {postos.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer hover:bg-muted transition-colors"
                      >
                        <Checkbox
                          checked={formData.posto_ids.includes(p.id)}
                          onCheckedChange={() => togglePosto(p.id)}
                        />
                        {p.nome}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Perfil + permissions */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs mb-1 block">Perfil base</Label>
                  <div className="flex gap-2 flex-wrap">
                    {PERFIS.map((p) => (
                      <Button
                        key={p.value}
                        type="button"
                        size="sm"
                        variant={formData.perfil === p.value ? 'default' : 'outline'}
                        className="text-xs h-8"
                        onClick={() => handlePerfilChange(p.value)}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Permissões de telas</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                    {ALL_PERMISSIONS.map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs cursor-pointer hover:bg-muted transition-colors"
                      >
                        <Checkbox
                          checked={formData.permissoes.includes(perm.key)}
                          onCheckedChange={() => togglePermission(perm.key)}
                        />
                        {perm.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={saving}>
                  <Save className="w-4 h-4 mr-1" />
                  {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar usuário'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={cancelForm}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* User list */}
      <Card>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário cadastrado.</p>
          ) : (
            <div className="divide-y">
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{u.nome}</span>
                      <span className="text-xs text-muted-foreground">@{u.username}</span>
                      <Badge variant={u.perfil === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                        {perfilLabel(u.perfil)}
                      </Badge>
                      {!u.ativo && <Badge variant="destructive" className="text-[10px]">Inativo</Badge>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {postoNames(u.posto_ids ?? [])} &nbsp;·&nbsp; {u.permissoes?.length ?? 0} tela(s)
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEditForm(u)} title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleToggleAtivo(u)}
                      title={u.ativo ? 'Desativar' : 'Reativar'}>
                      {u.ativo
                        ? <UserX className="w-3.5 h-3.5 text-yellow-600" />
                        : <UserCheck className="w-3.5 h-3.5 text-green-600" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setDeletingId(u.id)} title="Excluir">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro será removido permanentemente. O acesso ao sistema será revogado imediatamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { const u = users.find((x) => x.id === deletingId); if (u) handleDelete(u); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
