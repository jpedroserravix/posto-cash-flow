import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
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

const emptyAuthState = {
  role: null,
  postoId: null,
  postoNome: null,
  allPostos: [],
  selectedPostoId: null,
} as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'funcionario' | null>(null);
  const [postoId, setPostoId] = useState<string | null>(null);
  const [postoNome, setPostoNome] = useState<string | null>(null);
  const [allPostos, setAllPostos] = useState<{ id: string; nome: string; cnpj: string }[]>([]);
  const [selectedPostoId, setSelectedPostoIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const resetState = useCallback(() => {
    setRole(emptyAuthState.role);
    setPostoId(emptyAuthState.postoId);
    setPostoNome(emptyAuthState.postoNome);
    setAllPostos(emptyAuthState.allPostos);
    setSelectedPostoIdState(emptyAuthState.selectedPostoId);
  }, []);

  const loadUserData = useCallback(async (userId: string) => {
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .limit(1);

    if (roleError) throw roleError;

    const userRole = (roles?.[0]?.role ?? null) as 'admin' | 'funcionario' | null;
    setRole(userRole);

    if (userRole === 'admin') {
      const { data: postos, error: postosError } = await supabase
        .from('postos')
        .select('id, nome, cnpj')
        .order('nome');

      if (postosError) throw postosError;

      const nextPostos = postos || [];
      setAllPostos(nextPostos);
      setPostoId(null);
      setPostoNome(null);
      setSelectedPostoIdState((current) => current && nextPostos.some((posto) => posto.id === current)
        ? current
        : nextPostos[0]?.id ?? null);
      return;
    }

    const { data: links, error: linkError } = await supabase
      .from('user_posto')
      .select('posto_id')
      .eq('user_id', userId)
      .limit(1);

    if (linkError) throw linkError;

    const assignedPostoId = links?.[0]?.posto_id ?? null;
    setAllPostos([]);
    setPostoId(assignedPostoId);
    setSelectedPostoIdState(assignedPostoId);

    if (!assignedPostoId) {
      setPostoNome(null);
      return;
    }

    const { data: posto, error: postoError } = await supabase
      .from('postos')
      .select('nome')
      .eq('id', assignedPostoId)
      .single();

    if (postoError) throw postoError;

    setPostoNome(posto?.nome ?? null);
  }, []);

  const syncSession = useCallback(async (sessionUser: User | null) => {
    setUser(sessionUser);

    if (!sessionUser) {
      resetState();
      setLoading(false);
      return;
    }

    try {
      await loadUserData(sessionUser.id);
    } catch (error) {
      console.error('Erro ao carregar dados do usuário:', error);
      resetState();
    } finally {
      setLoading(false);
    }
  }, [loadUserData, resetState]);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (isMounted) {
        await syncSession(session?.user ?? null);
      }
    };

    void init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      queueMicrotask(() => {
        if (isMounted) {
          void syncSession(session?.user ?? null);
        }
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      role,
      postoId,
      postoNome,
      allPostos,
      selectedPostoId,
      setSelectedPostoId: setSelectedPostoIdState as (id: string) => void,
      loading,
      signOut,
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

