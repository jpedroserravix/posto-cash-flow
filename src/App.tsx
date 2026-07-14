import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { firstAllowedPath } from "@/lib/permissions";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import DepositosBrinks from "./pages/DepositosBrinks";
import DepositosManuais from "./pages/DepositosManuais";
import ResumoDiario from "./pages/ResumoDiario";
import Postos from "./pages/Postos";
import Usuarios from "./pages/Usuarios";
import ContasBancarias from "./pages/ContasBancarias";
import ExtratoBancario from "./pages/ExtratoBancario";
import AppLayout from "./components/AppLayout";
import EnvioRapido from "./pages/EnvioRapido";
import Documentos from "./pages/Documentos";
import Funcionarios from "./pages/pessoal/Funcionarios";
import PontoOcorrencias from "./pages/pessoal/PontoOcorrencias";
import FechamentoMensal from "./pages/pessoal/FechamentoMensal";
import HistoricoFuncionario from "./pages/pessoal/HistoricoFuncionario";
import Recrutamento from "./pages/pessoal/Recrutamento";
import LancamentoNotas from "./pages/notas/LancamentoNotas";
import Pedidos from "./pages/compras/Pedidos";
import Cursos from "./pages/Cursos";
import Configuracoes from "./pages/Configuracoes";
import AcessosSenhas from "./pages/AcessosSenhas";
import Contabilidade from "./pages/contabilidade/Contabilidade";
import IdentidadeVisual from "./pages/identidade/IdentidadeVisual";
import CaixaEntrada from "./pages/CaixaEntrada";
import Almoxarifado from "./pages/manutencao/Almoxarifado";
import Chamados from "./pages/manutencao/Chamados";
import ConciliacaoPix from "./pages/financeiro/ConciliacaoPix";
import ImportarVendasCartoes from "./pages/financeiro/cartoes/ImportarVendas";
import CartoesAReceber from "./pages/financeiro/cartoes/AReceber";
import VendasImportadas from "./pages/financeiro/cartoes/VendasImportadas";
import Publico from "./pages/Publico";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center text-muted-foreground">
    Carregando...
  </div>
);

function ProtectedRoute({
  children,
  permission,
}: {
  children: React.ReactNode;
  permission?: string;
}) {
  const { user, loading, hasPermission, permissoes } = useAuth();

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;

  // Wait until permissions have been loaded (permissoes will be empty array until profile loads)
  // We detect "still loading permissions" by checking if the user is set but permissoes hasn't populated yet.
  // Since loading=false at this point, if permissoes is empty it means the user truly has no permissions.

  if (permission && !hasPermission(permission)) {
    const fallback = firstAllowedPath(hasPermission);
    return <Navigate to={fallback} replace />;
  }

  return <AppLayout>{children}</AppLayout>;
}

// "/" renders Dashboard if user has dashboard permission, otherwise their first allowed page
function HomeRoute() {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (hasPermission('dashboard')) return <AppLayout><Dashboard /></AppLayout>;
  const fallback = firstAllowedPath(hasPermission);
  if (fallback === '/') return <AppLayout><Dashboard /></AppLayout>; // shouldn't loop
  return <Navigate to={fallback} replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<HomeRoute />} />
      <Route path="/brinks"      element={<ProtectedRoute permission="brinks">     <DepositosBrinks /></ProtectedRoute>} />
      <Route path="/manuais"     element={<ProtectedRoute permission="manuais">    <DepositosManuais /></ProtectedRoute>} />
      <Route path="/resumo"      element={<ProtectedRoute permission="resumo">     <ResumoDiario /></ProtectedRoute>} />
      <Route path="/extrato"     element={<ProtectedRoute permission="extrato">    <ExtratoBancario /></ProtectedRoute>} />
      <Route path="/postos"      element={<ProtectedRoute permission="postos">     <Postos /></ProtectedRoute>} />
      <Route path="/usuarios"    element={<ProtectedRoute permission="usuarios">   <Usuarios /></ProtectedRoute>} />
      <Route path="/bancos"      element={<ProtectedRoute permission="bancos">     <ContasBancarias /></ProtectedRoute>} />
      <Route path="/funcionarios"      element={<ProtectedRoute permission="pessoal"><Funcionarios /></ProtectedRoute>} />
      <Route path="/ponto"             element={<ProtectedRoute permission="pessoal"><PontoOcorrencias /></ProtectedRoute>} />
      <Route path="/fechamento"        element={<ProtectedRoute permission="pessoal"><FechamentoMensal /></ProtectedRoute>} />
      <Route path="/historico-pessoal" element={<ProtectedRoute permission="pessoal"><HistoricoFuncionario /></ProtectedRoute>} />
      <Route path="/recrutamento"      element={<ProtectedRoute permission="recrutamento"><Recrutamento /></ProtectedRoute>} />
      <Route path="/alvaras"       element={<ProtectedRoute permission="alvaras">      <Documentos /></ProtectedRoute>} />
      <Route path="/garantias"     element={<ProtectedRoute permission="garantias">    <Documentos /></ProtectedRoute>} />
      <Route path="/docs-empresa"  element={<ProtectedRoute permission="docs-empresa"> <Documentos /></ProtectedRoute>} />
      <Route path="/envio-rapido"  element={<ProtectedRoute permission="envio-rapido">    <EnvioRapido /></ProtectedRoute>} />
      <Route path="/compras/pedidos" element={<ProtectedRoute permission="pedidos-compra">   <Pedidos /></ProtectedRoute>} />
      <Route path="/compras/notas"   element={<ProtectedRoute permission="lancamento-notas"> <LancamentoNotas /></ProtectedRoute>} />
      <Route path="/cursos"           element={<ProtectedRoute permission="cursos-treinamentos"><Cursos /></ProtectedRoute>} />
      <Route path="/configuracoes"    element={<ProtectedRoute permission="configuracoes"><Configuracoes /></ProtectedRoute>} />
      <Route path="/acessos-senhas"   element={<ProtectedRoute permission="acessos-senhas"><AcessosSenhas /></ProtectedRoute>} />
      <Route path="/contabilidade"     element={<ProtectedRoute permission="contabilidade"><Contabilidade /></ProtectedRoute>} />
      <Route path="/identidade-visual" element={<ProtectedRoute permission="identidade-visual"><IdentidadeVisual /></ProtectedRoute>} />
      <Route path="/caixa-entrada"    element={<ProtectedRoute permission="caixa-entrada"><CaixaEntrada /></ProtectedRoute>} />
      <Route path="/almoxarifado"          element={<ProtectedRoute permission="almoxarifado"><Almoxarifado /></ProtectedRoute>} />
      <Route path="/manutencao/chamados"   element={<ProtectedRoute permission="chamados"><Chamados /></ProtectedRoute>} />
      <Route path="/financeiro/conciliacao-pix"    element={<ProtectedRoute permission="conciliacao-pix"><ConciliacaoPix /></ProtectedRoute>} />
      <Route path="/financeiro/cartoes/importar" element={<ProtectedRoute permission="cartoes-importar"><ImportarVendasCartoes /></ProtectedRoute>} />
      <Route path="/financeiro/cartoes/a-receber" element={<ProtectedRoute permission="cartoes-a-receber"><CartoesAReceber /></ProtectedRoute>} />
      <Route path="/financeiro/cartoes/vendas"    element={<ProtectedRoute permission="cartoes-vendas"><VendasImportadas /></ProtectedRoute>} />
      <Route path="/publico"          element={<Publico />} />
      {/* backward-compat redirect */}
      <Route path="/notas"           element={<Navigate to="/compras/notas" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
