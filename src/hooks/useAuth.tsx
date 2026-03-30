import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'funcionario' | null;
  postoId: string | null;
  postoNome: string | null;
  allPostos: { id: string; nome: string; cnpj: string }[];
  selectedPostoId: string | null;
  setSelectedPostoId: (id: string) => void;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'funcionario' | null>(null);
  const [postoId, setPostoId] = useState<string | null>(null);
  const [postoNome, setPostoNome] = useState<string | null>(null);
  const [allPostos, setAllPostos] = useState<{ id: string; nome: string; cnpj: string }[]>([]);
  const [selectedPostoId, setSelectedPostoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await loadUserData(currentUser.id);
      } else {
        setRole(null);
        setPostoId(null);
        setPostoNome(null);
        setAllPostos([]);
        setSelectedPostoId(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        await loadUserData(currentUser.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadUserData(userId: string) {
    // Get role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    const userRole = roles?.[0]?.role as 'admin' | 'funcionario' | null;
    setRole(userRole);

    if (userRole === 'admin') {
      // Admin: load all postos
      const { data: postos } = await supabase.from('postos').select('id, nome, cnpj');
      setAllPostos(postos || []);
      if (postos && postos.length > 0) {
        setSelectedPostoId(postos[0].id);
      }
    } else {
      // Funcionario: load assigned posto
      const { data: links } = await supabase
        .from('user_posto')
        .select('posto_id')
        .eq('user_id', userId);
      
      if (links && links.length > 0) {
        setPostoId(links[0].posto_id);
        setSelectedPostoId(links[0].posto_id);
        const { data: posto } = await supabase
          .from('postos')
          .select('nome')
          .eq('id', links[0].posto_id)
          .single();
        setPostoNome(posto?.nome || null);
      }
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, role, postoId, postoNome, allPostos,
      selectedPostoId, setSelectedPostoId, loading, signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
