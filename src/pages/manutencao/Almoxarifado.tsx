import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Search, Archive } from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface ItemPatrimonio {
  id: string;
  nome: string;
  categoria: string | null;
  tipo_item: string | null;
  codigo: string | null;
  posto_atual_id: string | null;
  postos: { nome: string } | null;
  status: string;
  valor: string | number | null;
  created_at: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusLabel(s: string): string {
  if (s === 'disponivel')    return 'Disponível';
  if (s === 'em_uso')        return 'Em Uso';
  if (s === 'em_manutencao') return 'Em Manutenção';
  if (s === 'baixado')       return 'Baixado';
  return s;
}

function statusClass(s: string): string {
  if (s === 'disponivel')    return 'bg-green-600 hover:bg-green-600 text-white';
  if (s === 'em_uso')        return 'bg-yellow-500 hover:bg-yellow-500 text-white';
  if (s === 'em_manutencao') return 'bg-yellow-500 hover:bg-yellow-500 text-white';
  return 'bg-gray-400 hover:bg-gray-400 text-white';
}

function categoriaLabel(c: string | null): string {
  if (c === 'ferramenta')  return 'Ferramenta';
  if (c === 'equipamento') return 'Equipamento';
  if (c === 'material')    return 'Material';
  return c ?? '—';
}

function formatValor(v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = parseFloat(String(v));
  if (isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── component ───────────────────────────────────────────────────────────────

export default function Almoxarifado() {
  const { selectedPostoId } = useAuth();

  const [items, setItems]     = useState<ItemPatrimonio[]>([]);
  const [loading, setLoading] = useState(true);

  const [search,          setSearch]          = useState('');
  const [filterStatus,    setFilterStatus]    = useState('__all__');
  const [filterCategoria, setFilterCategoria] = useState('__all__');

  useEffect(() => { load(); }, [selectedPostoId]);

  async function load() {
    if (!selectedPostoId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('itens_patrimonio')
        .select('id, nome, categoria, tipo_item, codigo, posto_atual_id, status, valor, created_at, postos(nome)')
        .eq('posto_atual_id', selectedPostoId)
        .order('nome', { ascending: true });

      if (error) { toast.error(`Erro ao carregar itens: ${error.message}`); }
      else { setItems((data as ItemPatrimonio[]) || []); }
    } catch (e: any) {
      toast.error(`Erro inesperado: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    let list = items;
    if (filterStatus !== '__all__') {
      list = list.filter((i) => i.status === filterStatus);
    }
    if (filterCategoria !== '__all__') {
      list = list.filter((i) => i.categoria === filterCategoria);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (i) =>
          i.nome.toLowerCase().includes(q) ||
          (i.codigo ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filterStatus, filterCategoria, search]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Almoxarifado</h1>
          <p className="text-sm text-muted-foreground">Itens do patrimônio da rede</p>
        </div>
        <Button disabled size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" />
          Novo Item
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por nome ou código..."
                className="pl-8 h-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-sm w-[165px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os status</SelectItem>
                <SelectItem value="disponivel">Disponível</SelectItem>
                <SelectItem value="em_uso">Em Uso</SelectItem>
                <SelectItem value="em_manutencao">Em Manutenção</SelectItem>
                <SelectItem value="baixado">Baixado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="h-9 text-sm w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                <SelectItem value="ferramenta">Ferramenta</SelectItem>
                <SelectItem value="equipamento">Equipamento</SelectItem>
                <SelectItem value="material">Material</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : !selectedPostoId ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Selecione um posto para visualizar os itens.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Archive className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-medium text-muted-foreground">
                {items.length === 0 ? 'Nenhum item cadastrado' : 'Nenhum item encontrado'}
              </p>
              {items.length > 0 && (
                <p className="text-xs text-muted-foreground">Tente ajustar os filtros de busca.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Categoria</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Valor</TableHead>
                    <TableHead className="text-xs">Posto</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm font-medium">{item.nome}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {item.codigo || '—'}
                      </TableCell>
                      <TableCell className="text-xs">{categoriaLabel(item.categoria)}</TableCell>
                      <TableCell className="text-xs">{item.tipo_item || '—'}</TableCell>
                      <TableCell className="text-xs">{formatValor(item.valor)}</TableCell>
                      <TableCell className="text-xs">{item.postos?.nome ?? '—'}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${statusClass(item.status)}`}>
                          {statusLabel(item.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
