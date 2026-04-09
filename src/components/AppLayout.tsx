import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Fuel, LogOut, FileSpreadsheet, PenLine, BarChart3, Building2, Users, Landmark, Receipt, Wrench } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  adminOnly?: boolean;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Financeiro',
    items: [
      { to: '/', label: 'Depósitos Brinks', icon: FileSpreadsheet },
      { to: '/manuais', label: 'Depósitos Manuais', icon: PenLine },
      { to: '/resumo', label: 'Resumo Diário', icon: BarChart3 },
      { to: '/extrato', label: 'Extrato Bancário', icon: Receipt, adminOnly: true },
    ],
  },
  {
    label: 'Pessoal',
    items: [
      { to: '/pessoal', label: 'Em construção', icon: Wrench },
    ],
  },
  {
    label: 'Cadastros',
    adminOnly: true,
    items: [
      { to: '/postos', label: 'Postos', icon: Building2 },
      { to: '/usuarios', label: 'Usuários', icon: Users },
      { to: '/bancos', label: 'Contas Bancárias', icon: Landmark },
    ],
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { role, postoNome, allPostos, selectedPostoId, setSelectedPostoId, signOut } = useAuth();
  const location = useLocation();

  const visibleGroups = navGroups
    .filter((g) => !g.adminOnly || role === 'admin')
    .map((g) => ({
      ...g,
      visibleItems: g.items.filter((item) => !item.adminOnly || role === 'admin'),
    }))
    .filter((g) => g.visibleItems.length > 0);

  const activeGroup = visibleGroups.find((g) =>
    g.visibleItems.some((item) => location.pathname === item.to)
  );

  const secondaryTabs = activeGroup && activeGroup.visibleItems.length > 1
    ? activeGroup.visibleItems
    : null;

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
            {role === 'admin' && allPostos.length > 0 && (
              <Select value={selectedPostoId || ''} onValueChange={setSelectedPostoId}>
                <SelectTrigger className="w-[180px] h-9 text-sm">
                  <SelectValue placeholder="Selecionar posto" />
                </SelectTrigger>
                <SelectContent>
                  {allPostos.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {role === 'funcionario' && postoNome && (
              <span className="text-sm text-muted-foreground">{postoNome}</span>
            )}
            <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Primary navigation — groups */}
      <nav className="bg-card border-b overflow-x-auto">
        <div className="container flex gap-1 py-1">
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
      <main className="container py-4">
        {children}
      </main>
    </div>
  );
}
