import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2, Settings, RotateCcw } from 'lucide-react';
import { invalidateListaConfig } from '@/hooks/useListaConfig';

// ─── types ──────────────────────────────────────────────────────────────────

interface ListaItem {
  id: string;
  lista: string;
  valor: string;
  ordem: number;
  ativo: boolean;
}

// ─── listas disponíveis ──────────────────────────────────────────────────────

const LISTAS: { key: string; label: string; hint?: string }[] = [
  { key: 'cargos',               label: 'Cargos',                           hint: 'Usado no cadastro de funcionários' },
  { key: 'cargos_publico',       label: 'Cargos — Página Pública',          hint: 'Opções de cargo exibidas no formulário público de candidatura (/publico)' },
  { key: 'escalas_trabalho',     label: 'Escalas de Trabalho',              hint: 'Usado na jornada de trabalho do funcionário' },
  { key: 'centros_custo',        label: 'Centros de Custo',                 hint: 'Usado nos depósitos Brinks e Manuais' },
  { key: 'tipos_doc_funcionario', label: 'Tipos de Documento do Funcionário', hint: 'Usado na aba Documentos do funcionário' },
  { key: 'tipos_doc_empresa',    label: 'Tipos de Documento da Empresa',    hint: 'Usado em Documentos da Empresa (a entrada "Outros" é reservada)' },
  { key: 'tipos_uniforme_epi',   label: 'Tipos de Uniforme/EPI',            hint: 'Usado nas entregas de uniforme e EPI pelo Envio Rápido' },
  { key: 'combustiveis',         label: 'Combustíveis',                     hint: 'Usado na tabela de aferição de bicos' },
  { key: 'tipos_patrimonio',       label: 'Tipos de Item (Almoxarifado)',      hint: 'Usado no cadastro de itens do patrimônio da rede' },
  { key: 'categorias_manutencao', label: 'Categorias de Manutenção',          hint: 'Usado no cadastro de chamados de manutenção' },
];

// ─── component ──────────────────────────────────────────────────────────────

export default function Configuracoes() {
  const [items, setItems]     = useState<ListaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('listas_configuracoes')
      .select('*')
      .order('lista')
      .order('ordem', { ascending: true });
    if (error) { toast.error('Erro ao carregar configurações'); }
    else { setItems((data as ListaItem[]) || []); }
    setLoading(false);
  }

  async function handleAdd(lista: string) {
    const raw = (adding[lista] || '').trim();
    if (!raw) return;

    // If item already exists and is active, block
    const activeMatch = items.find(
      (it) => it.lista === lista && it.ativo && it.valor.toLowerCase() === raw.toLowerCase()
    );
    if (activeMatch) { toast.error('Esse valor já existe na lista'); return; }

    // If item exists but is inactive, reactivate instead of inserting
    const inactiveMatch = items.find(
      (it) => it.lista === lista && !it.ativo && it.valor.toLowerCase() === raw.toLowerCase()
    );
    if (inactiveMatch) {
      await handleReactivate(inactiveMatch);
      setAdding((prev) => ({ ...prev, [lista]: '' }));
      return;
    }

    setSaving(lista);
    const maxOrdem = items
      .filter((it) => it.lista === lista)
      .reduce((acc, it) => Math.max(acc, it.ordem), 0);

    const { data, error } = await (supabase as any)
      .from('listas_configuracoes')
      .insert({ lista, valor: raw, ordem: maxOrdem + 10, ativo: true })
      .select()
      .single();

    if (error) { toast.error(`Erro ao adicionar: ${error.message}`); }
    else {
      setItems((prev) => [...prev, data as ListaItem]);
      setAdding((prev) => ({ ...prev, [lista]: '' }));
      invalidateListaConfig(lista);
      toast.success('Item adicionado');
    }
    setSaving(null);
  }

  async function handleReactivate(item: ListaItem) {
    setSaving(item.id);
    const { error } = await (supabase as any)
      .from('listas_configuracoes')
      .update({ ativo: true })
      .eq('id', item.id);

    if (error) { toast.error(`Erro ao reativar: ${error.message}`); }
    else {
      setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, ativo: true } : it));
      invalidateListaConfig(item.lista);
      toast.success('Item reativado');
    }
    setSaving(null);
  }

  async function handleDelete(item: ListaItem) {
    if (item.lista === 'tipos_doc_empresa' && item.valor === 'Outros') {
      toast.error('O item "Outros" é reservado e não pode ser removido');
      return;
    }
    setSaving(item.id);
    const { error } = await (supabase as any)
      .from('listas_configuracoes')
      .update({ ativo: false })
      .eq('id', item.id);

    if (error) { toast.error(`Erro ao remover: ${error.message}`); }
    else {
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      invalidateListaConfig(item.lista);
      toast.success('Item removido');
    }
    setSaving(null);
  }

  const activeByLista   = (lista: string) => items.filter((it) => it.lista === lista && it.ativo);
  const inactiveByLista = (lista: string) => items.filter((it) => it.lista === lista && !it.ativo);

  if (loading) {
    return (
      <div className="p-6 text-muted-foreground text-sm">Carregando...</div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <Settings className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Configurações</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Gerencie as listas suspensas utilizadas em todo o sistema.
      </p>

      {LISTAS.map(({ key, label, hint }) => {
        const activeItems   = activeByLista(key);
        const inactiveItems = inactiveByLista(key);
        const addVal = adding[key] || '';

        return (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{label}</CardTitle>
              {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Active items */}
              {activeItems.length === 0 && inactiveItems.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Nenhum item cadastrado — usando valores padrão do sistema.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeItems.map((item) => (
                    <Badge
                      key={item.id}
                      variant="secondary"
                      className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 text-sm"
                    >
                      {item.valor}
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={saving === item.id}
                        className="ml-0.5 hover:text-red-500 transition-colors disabled:opacity-40"
                        title="Remover"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                  {inactiveItems.map((item) => (
                    <Badge
                      key={item.id}
                      variant="outline"
                      className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-0.5 text-sm text-muted-foreground border-dashed opacity-60"
                    >
                      {item.valor}
                      <button
                        onClick={() => handleReactivate(item)}
                        disabled={saving === item.id}
                        className="ml-0.5 hover:text-green-600 transition-colors disabled:opacity-40"
                        title="Reativar"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Add form */}
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); handleAdd(key); }}
              >
                <Input
                  value={addVal}
                  onChange={(e) => setAdding((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder="Novo item..."
                  className="h-8 text-sm"
                  disabled={saving === key}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!addVal.trim() || saving === key}
                  className="h-8 gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </Button>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
