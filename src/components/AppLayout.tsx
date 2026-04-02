import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Fuel, LogOut, FileSpreadsheet, PenLine, BarChart3, Building2, Users, Landmark, Receipt } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Depósitos Brinks', icon: FileSpreadsheet },
  { to: '/manuais', label: 'Depósitos Manuais', icon: PenLine },
  { to: '/resumo', label: 'Resumo Diário', icon: BarChart3 },
];

const adminItems = [
  { to: '/postos', label: 'Postos', icon: Building2 },
  { to: '/usuarios', label: 'Usuários', icon: Users },
  { to: '/bancos', label: 'Bancos', icon: Landmark },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { role, postoNome, allPostos, selectedPostoId, setSelectedPostoId, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14 gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Fuel className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm hidden sm:block">Controle de Caixa</span>
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

      {/* Navigation */}
      <nav className="bg-card border-b overflow-x-auto">
        <div className="container flex gap-1 py-1">
          {navItems.map(item => (
            <Link key={item.to} to={item.to}>
              <Button
                variant={location.pathname === item.to ? 'default' : 'ghost'}
                size="sm"
                className="text-xs gap-1.5 whitespace-nowrap"
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Button>
            </Link>
          ))}
          {role === 'admin' && adminItems.map(item => (
            <Link key={item.to} to={item.to}>
              <Button
                variant={location.pathname === item.to ? 'default' : 'ghost'}
                size="sm"
                className="text-xs gap-1.5 whitespace-nowrap"
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Button>
            </Link>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="container py-4">
        {children}
      </main>
    </div>
  );
}
