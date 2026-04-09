import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import DepositosBrinks from "./pages/DepositosBrinks";
import DepositosManuais from "./pages/DepositosManuais";
import ResumoDiario from "./pages/ResumoDiario";
import Postos from "./pages/Postos";
import Usuarios from "./pages/Usuarios";
import ContasBancarias from "./pages/ContasBancarias";
import ExtratoBancario from "./pages/ExtratoBancario";
import AppLayout from "./components/AppLayout";
import Pessoal from "./pages/Pessoal";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><DepositosBrinks /></ProtectedRoute>} />
      <Route path="/manuais" element={<ProtectedRoute><DepositosManuais /></ProtectedRoute>} />
      <Route path="/resumo" element={<ProtectedRoute><ResumoDiario /></ProtectedRoute>} />
      <Route path="/postos" element={<ProtectedRoute><Postos /></ProtectedRoute>} />
      <Route path="/usuarios" element={<ProtectedRoute><Usuarios /></ProtectedRoute>} />
      <Route path="/bancos" element={<ProtectedRoute><ContasBancarias /></ProtectedRoute>} />
      <Route path="/extrato" element={<ProtectedRoute><ExtratoBancario /></ProtectedRoute>} />
      <Route path="/pessoal" element={<ProtectedRoute><Pessoal /></ProtectedRoute>} />
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
