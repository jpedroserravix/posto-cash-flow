import { ReactNode, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Fuel, LogOut, FileSpreadsheet, PenLine, BarChart3, Building2, Users,
  Landmark, Receipt, Zap, LayoutDashboard, FileCheck2, ShoppingBag,
  UserCircle, Clock, Calculator, History, ClipboardList, Package,
  Info, Copy, Check, GraduationCap, LayoutGrid, Settings, KeyRound, ChevronDown,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

// ─── Posto info popover ──────────────────────────────────────────────────────

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

// ─── Nav config ─────────────────────────────────────────────────────────────

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

// Groups rendered in primary nav bar
const primaryNavGroups: NavGroup[] = [
  {
    label: 'Financeiro',
    items: [
      { to: '/brinks',  label: 'Depósitos Brinks',  icon: FileSpreadsheet, permission: 'brinks' },
      { to: '/manuais', label: 'Depósitos Manuais', icon: PenLine,         permission: 'manuais' },
      { to: '/resumo',  label: 'Resumo Diário / CAIXAS', icon: BarChart3, permission: 'resumo' },
      { to: '/extrato', label: 'Extrato Bancário',   icon: Receipt,         permission: 'extrato' },
    ],
  },
  {
    label: 'Pessoal',
    items: [
      { to: '/funcionarios',      label: 'Funcionários',        icon: UserCircle, permission: 'pessoal' },
      { to: '/ponto',             label: 'Ponto e Ocorrências', icon: Clock,      permission: 'pessoal' },
      { to: '/fechamento',        label: 'Fechamento Mensal',   icon: Calculator, permission: 'pessoal' },
      { to: '/historico-pessoal', label: 'Histórico',           icon: History,    permission: 'pessoal' },
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

// Groups rendered in the header (moved out of primary nav)
const headerNavGroups: NavGroup[] = [
  {
    label: 'Documentos',
    items: [
      { to: '/alvaras',      label: 'Alvarás e Licenças',        icon: FileCheck2,  permission: 'alvaras' },
      { to: '/garantias',    label: 'Notas Fiscais e Garantias', icon: ShoppingBag, permission: 'garantias' },
      { to: '/docs-empresa', label: 'Documentos da Empresa',     icon: Building2,   permission: 'docs-empresa' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { to: '/postos',   label: 'Postos',                icon: Building2,     permission: 'postos' },
      { to: '/usuarios', label: 'Usuários',              icon: Users,         permission: 'usuarios' },
      { to: '/bancos',   label: 'Contas Bancárias',      icon: Landmark,      permission: 'bancos' },
      { to: '/cursos',          label: 'Cursos e Treinamentos', icon: GraduationCap, permission: 'cursos-treinamentos' },
      { to: '/configuracoes',   label: 'Configurações',         icon: Settings,      permission: 'configuracoes' },
      { to: '/acessos-senhas',  label: 'Acessos e Senhas',      icon: KeyRound,      permission: 'acessos-senhas' },
    ],
  },
];

// All groups combined — used for secondary tab detection
const allNavGroups: NavGroup[] = [...primaryNavGroups, ...headerNavGroups];

// ─── Alterar Senha Modal ─────────────────────────────────────────────────────

const EMPTY_PWD = { atual: '', nova: '', confirmar: '' };

function AlterarSenhaModal({
  open,
  onClose,
  userEmail,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  userEmail: string;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState(EMPTY_PWD);
  const [loading, setLoading] = useState(false);

  function reset() { setForm(EMPTY_PWD); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.nova.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (form.nova !== form.confirmar) {
      toast.error('A confirmação não coincide com a nova senha');
      return;
    }

    setLoading(true);

    // 1 — Verify current password by re-authenticating
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: form.atual,
    });
    if (authError) {
      toast.error('Senha atual incorreta');
      setLoading(false);
      return;
    }

    // 2 — Update password
    const { error: updateError } = await supabase.auth.updateUser({ password: form.nova });
    if (updateError) {
      toast.error(`Erro ao alterar senha: ${updateError.message}`);
      setLoading(false);
      return;
    }

    toast.success('Senha alterada com sucesso! Você será deslogado.');
    setLoading(false);
    onClose();
    reset();

    // Small delay so the user reads the toast, then sign out
    setTimeout(() => { onSuccess(); }, 1500);
  }

  function handleClose() {
    if (loading) return;
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            Alterar Senha
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Senha atual</Label>
            <Input
              type="password"
              value={form.atual}
              onChange={(e) => setForm((f) => ({ ...f, atual: e.target.value }))}
              autoComplete="current-password"
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nova senha</Label>
            <Input
              type="password"
              value={form.nova}
              onChange={(e) => setForm((f) => ({ ...f, nova: e.target.value }))}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              disabled={loading}
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Confirmar nova senha</Label>
            <Input
              type="password"
              value={form.confirmar}
              onChange={(e) => setForm((f) => ({ ...f, confirmar: e.target.value }))}
              autoComplete="new-password"
              disabled={loading}
              required
            />
          </div>
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={loading || !form.atual || !form.nova || !form.confirmar}>
              {loading ? 'Salvando...' : 'Alterar senha'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, postoNome, allPostos, selectedPostoId, setSelectedPostoId, signOut, hasPermission, nome } = useAuth();
  const firstName = nome ? nome.trim().split(' ')[0] : null;
  const location = useLocation();
  const [postoFull, setPostoFull] = useState<PostoFull | null>(null);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);

  useEffect(() => {
    if (!selectedPostoId) { setPostoFull(null); return; }
    supabase
      .from('postos')
      .select('id, nome, cnpj, inscricao_estadual, endereco, email')
      .eq('id', selectedPostoId)
      .single()
      .then(({ data }) => setPostoFull(data as PostoFull | null));
  }, [selectedPostoId]);

  // Filtered groups visible to the current user
  const visiblePrimary = primaryNavGroups
    .map((g) => ({ ...g, visibleItems: g.items.filter((i) => hasPermission(i.permission)) }))
    .filter((g) => g.visibleItems.length > 0);

  const visibleHeader = headerNavGroups
    .map((g) => ({ ...g, visibleItems: g.items.filter((i) => hasPermission(i.permission)) }))
    .filter((g) => g.visibleItems.length > 0);

  // Secondary tabs: look across ALL groups
  const allVisible = allNavGroups
    .map((g) => ({ ...g, visibleItems: g.items.filter((i) => hasPermission(i.permission)) }))
    .filter((g) => g.visibleItems.length > 0);

  const activeGroup = allVisible.find((g) =>
    g.visibleItems.some((item) => location.pathname === item.to)
  );

  const secondaryTabs =
    activeGroup && activeGroup.visibleItems.length > 1 ? activeGroup.visibleItems : null;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-card/90 backdrop-blur-md border-b border-border/70 sticky top-0 z-50 shadow-sm">
        <div className="container flex items-center h-14 gap-2">

          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-sm ring-1 ring-primary/20">
              <Fuel className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-tight hidden md:block">POSTO INTELIGENTE</span>
          </div>

          {/* Cadastros + Documentos — desktop: text buttons, mobile: dropdown */}
          {visibleHeader.length > 0 && (
            <>
              {/* Desktop */}
              <div className="hidden sm:flex items-center gap-1 ml-2">
                {visibleHeader.map((group) => {
                  const isActive = group.visibleItems.some((item) => location.pathname === item.to);
                  return (
                    <Link key={group.label} to={group.visibleItems[0].to}>
                      <Button
                        variant={isActive ? 'secondary' : 'ghost'}
                        size="sm"
                        className="text-xs whitespace-nowrap"
                      >
                        {group.label}
                      </Button>
                    </Link>
                  );
                })}
              </div>

              {/* Mobile: single dropdown */}
              <div className="flex sm:hidden ml-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9" title="Cadastros e Documentos">
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                    {visibleHeader.map((group, gi) => (
                      <div key={group.label}>
                        {gi > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuLabel className="text-xs">{group.label}</DropdownMenuLabel>
                        {group.visibleItems.map((item) => (
                          <DropdownMenuItem key={item.to} asChild>
                            <Link to={item.to} className="flex items-center gap-2 text-xs">
                              <item.icon className="w-3.5 h-3.5" />
                              {item.label}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Posto selector / name + info + logout */}
          <div className="flex items-center gap-1.5 min-w-0">
            {allPostos.length > 1 && (
              <Select value={selectedPostoId || ''} onValueChange={setSelectedPostoId}>
                <SelectTrigger className="h-9 text-xs sm:text-sm w-auto min-w-[100px]">
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
              <span className="text-xs sm:text-sm text-muted-foreground font-medium whitespace-nowrap">
                {postoNome}
              </span>
            )}
            {postoFull && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Informações do posto">
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 shrink-0">
                  {firstName && (
                    <span className="text-xs font-medium hidden sm:inline">{firstName}</span>
                  )}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {user?.email && (
                  <>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground truncate">
                      {user.email}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => setPwdModalOpen(true)} className="gap-2 text-xs cursor-pointer">
                  <KeyRound className="w-3.5 h-3.5" />
                  Alterar senha
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="gap-2 text-xs cursor-pointer text-red-600 focus:text-red-600">
                  <LogOut className="w-3.5 h-3.5" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Primary navigation ─────────────────────────────────────────────── */}
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

          {visiblePrimary.map((group) => {
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

      {/* ── Secondary navigation — sub-tabs within active group ────────────── */}
      {secondaryTabs && (
        <div className="bg-background border-b border-border/70 overflow-x-auto">
          <div className="container flex gap-0 py-0">
            {secondaryTabs.map((item) => {
              const isActive = location.pathname === item.to;
              return (
                <Link key={item.to} to={item.to} className="relative">
                  <button
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap transition-all duration-200 ${
                      isActive
                        ? 'text-primary font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                  <span
                    className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full transition-all duration-300 ${
                      isActive ? 'bg-primary opacity-100' : 'bg-primary opacity-0'
                    }`}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <main className="container py-4">{children}</main>

      {/* ── Alterar Senha Modal ─────────────────────────────────────────────── */}
      <AlterarSenhaModal
        open={pwdModalOpen}
        onClose={() => setPwdModalOpen(false)}
        userEmail={user?.email ?? ''}
        onSuccess={signOut}
      />
    </div>
  );
}
