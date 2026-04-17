import { ReactNode, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Fuel, LogOut, FileSpreadsheet, PenLine, BarChart3, Building2, Users, Landmark, Receipt, Wrench, Zap, LayoutDashboard, FileCheck2, ShoppingBag, UserCircle, Clock, Calculator, History, ClipboardList, Package, Info, Copy, Check } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface PostoFull {
  id: string;
  nome: string;
  cnpj: string | null;
  inscricao_estadual: string | null;
  endereco: string | null;
  email: string | null;
}

function CopyRow({ label, value }: { label: string; value: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground leading-none mb-0.5">{label}</div>
        <div className="text-xs font-medium break-all">{value || '—'}</div>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6 shrink-0"
        onClick={copy}
        disabled={!value}
        title="Copiar"
      >
        {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
      </Button>
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Financeiro',
    items: [
      { to: '/brinks',  label: 'Depósitos Brinks',  icon: FileSpreadsheet, permission: 'brinks' },
      { to: '/manuais', label: 'Depósitos Manuais', icon: PenLine,         permission: 'manuais' },
      { to: '/resumo',  label: 'Resumo Diário',      icon: BarChart3,       permission: 'resumo' },
      { to: '/extrato', label: 'Extrato Bancário',   icon: Receipt,         permission: 'extrato' },
    ],
  },
  {
    label: 'Pessoal',
    items: [
      { to: '/funcionarios',       label: 'Funcionários',       icon: UserCircle,  permission: 'pessoal' },
      { to: '/ponto',              label: 'Ponto e Ocorrências', icon: Clock,       permission: 'pessoal' },
      { to: '/fechamento',         label: 'Fechamento Mensal',   icon: Calculator,  permission: 'pessoal' },
      { to: '/historico-pessoal',  label: 'Histórico',           icon: History,     permission: 'pessoal' },
    ],
  },
  {
    label: 'Documentos',
    items: [
      { to: '/alvaras',      label: 'Alvarás e Licenças',       icon: FileCheck2,  permission: 'alvaras' },
      { to: '/garantias',    label: 'Notas Fiscais e Garantias', icon: ShoppingBag, permission: 'garantias' },
      { to: '/docs-empresa', label: 'Documentos da Empresa',    icon: Building2,   permission: 'docs-empresa' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { to: '/postos',   label: 'Postos',            icon: Building2, permission: 'postos' },
      { to: '/usuarios', label: 'Usuários',           icon: Users,     permission: 'usuarios' },
      { to: '/bancos',   label: 'Contas Bancárias',   icon: Landmark,  permission: 'bancos' },
    ],
  },
  {
    label: 'Compras',
    items: [
      { to: '/compras/pedidos', label: 'Pedidos',             icon: Package,       permission: 'pedidos-compra' },
      { to: '/compras/notas',   label: 'Lançamento de Notas', icon: ClipboardList, permission: 'lancamento-notas' },
    ],
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { role, postoNome, allPostos, selectedPostoId, setSelectedPostoId, signOut, hasPermission } = useAuth();
  const location = useLocation();
  const [postoFull, setPostoFull] = useState<PostoFull | null>(null);

  useEffect(() => {
    if (!selectedPostoId) { setPostoFull(null); return; }
    supabase
      .from('postos')
      .select('id, nome, cnpj, inscricao_estadual, endereco, email')
      .eq('id', selectedPostoId)
      .single()
      .then(({ data }) => setPostoFull(data as PostoFull | null));
  }, [selectedPostoId]);

  const visibleGroups = navGroups
    .map((g) => ({
      ...g,
      visibleItems: g.items.filter((item) => hasPermission(item.permission)),
    }))
    .filter((g) => g.visibleItems.length > 0);

  const activeGroup = visibleGroups.find((g) =>
    g.visibleItems.some((item) => location.pathname === item.to)
  );

  const secondaryTabs =
    activeGroup && activeGroup.visibleItems.length > 1 ? activeGroup.visibleItems : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Fuel className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm hidden sm:block">POSTO INTELIGENTE</span>
          </div>

          <div className="flex items-center gap-2">
            {allPostos.length > 1 && (
              <Select value={selectedPostoId || ''} onValueChange={setSelectedPostoId}>
                <SelectTrigger className="w-[180px] h-9 text-sm">
                  <SelectValue placeholder="Selecionar posto" />
                </SelectTrigger>
                <SelectContent>
                  {allPostos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {allPostos.length <= 1 && postoNome && (
              <span className="text-sm text-muted-foreground">{postoNome}</span>
            )}
            {postoFull && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9" title="Informações do posto">
                    <Info className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="end">
                  <div className="font-semibold text-sm mb-1">{postoFull.nome}</div>
                  <div className="divide-y divide-border">
                    <CopyRow label="CNPJ" value={postoFull.cnpj} />
                    <CopyRow label="Inscrição Estadual" value={postoFull.inscricao_estadual} />
                    <CopyRow label="Endereço" value={postoFull.endereco} />
                    <CopyRow label="E-mail" value={postoFull.email} />
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Primary navigation */}
      <nav className="bg-card border-b overflow-x-auto">
        <div className="container flex gap-1 py-1">
          {hasPermission('dashboard') && (
            <Link to="/">
              <Button
                variant={location.pathname === '/' ? 'default' : 'ghost'}
                size="sm"
                className="text-xs gap-1.5 whitespace-nowrap"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </Button>
            </Link>
          )}

          {visibleGroups.map((group) => {
            const isActive = group.visibleItems.some((item) => location.pathname === item.to);
            const firstTo = group.visibleItems[0].to;
            return (
              <Link key={group.label} to={firstTo}>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  size="sm"
                  className="text-xs whitespace-nowrap"
                >
                  {group.label}
                </Button>
              </Link>
            );
          })}

          {hasPermission('envio-rapido') && (
            <div className="ml-auto">
              <Link to="/envio-rapido">
                <Button
                  variant={location.pathname === '/envio-rapido' ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs gap-1.5 whitespace-nowrap"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Envio Rápido
                </Button>
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Secondary navigation — tabs within active group */}
      {secondaryTabs && (
        <div className="bg-background border-b overflow-x-auto">
          <div className="container flex gap-0 py-0">
            {secondaryTabs.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link key={item.to} to={item.to}>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-colors ${
                      isActive
                        ? 'border-primary text-primary font-medium'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="container py-4">{children}</main>
    </div>
  );
}
