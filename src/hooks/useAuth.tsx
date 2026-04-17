import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';
import { PROFILE_PRESETS } from '@/lib/permissions';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'funcionario' | null; // kept for backward-compat with existing page code
  perfil: string | null;
  nome: string | null;
  username: string | null;
  postoId: string | null;
  postoNome: string | null;
  allPostos: { id: string; nome: string; cnpj: string }[];
  selectedPostoId: string | null;
  setSelectedPostoId: (id: string) => void;
  permissoes: string[];
  hasPermission: (key: string) => boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'funcionario' | null>(null);
  const [perfil, setPerfil] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [postoId, setPostoId] = useState<string | null>(null);
  const [postoNome, setPostoNome] = useState<string | null>(null);
  const [allPostos, setAllPostos] = useState<{ id: string; nome: string; cnpj: string }[]>([]);
  const [selectedPostoId, setSelectedPostoIdState] = useState<string | null>(null);
  const [permissoes, setPermissoes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const resetState = useCallback(() => {
    setRole(null);
    setPerfil(null);
    setNome(null);
    setUsername(null);
    setPostoId(null);
    setPostoNome(null);
    setAllPostos([]);
    setSelectedPostoIdState(null);
    setPermissoes([]);
  }, []);

  const loadPostoData = useCallback(async (isAdmin: boolean, assignedPostoIds: string[]) => {
    if (isAdmin) {
      const { data: postos } = await supabase.from('postos').select('id, nome, cnpj').order('nome');
      const nextPostos = postos || [];
      setAllPostos(nextPostos);
      setPostoId(null);
      setPostoNome(null);
      setSelectedPostoIdState((current) =>
        current && nextPostos.some((p) => p.id === current)
          ? current
          : nextPostos[0]?.id ?? null
      );
    } else if (assignedPostoIds.length === 0) {
      setAllPostos([]);
      setPostoId(null);
      setPostoNome(null);
      setSelectedPostoIdState(null);
    } else if (assignedPostoIds.length === 1) {
      const singleId = assignedPostoIds[0];
      setAllPostos([]);
      setPostoId(singleId);
      setSelectedPostoIdState(singleId);
      const { data: posto } = await supabase
        .from('postos')
        .select('nome')
        .eq('id', singleId)
        .single();
      setPostoNome(posto?.nome ?? null);
    } else {
      // Multiple postos — load them for the switcher
      const { data: postos } = await supabase
        .from('postos')
        .select('id, nome, cnpj')
        .in('id', assignedPostoIds)
        .order('nome');
      const nextPostos = postos || [];
      setAllPostos(nextPostos);
      setPostoId(null);
      setPostoNome(null);
      setSelectedPostoIdState((current) =>
        current && nextPostos.some((p) => p.id === current)
          ? current
          : nextPostos[0]?.id ?? null
      );
    }
  }, []);

  const loadUserData = useCallback(
    async (userId: string) => {
      // Try new user_profiles table first
      const { data: profileRaw } = await supabase
        .from('user_profiles' as any)
        .select('nome, username, perfil, posto_ids, permissoes, ativo')
        .eq('user_id', userId)
        .maybeSingle();
      const profile = profileRaw as {
        nome: string; username: string; perfil: string;
        posto_ids: string[]; permissoes: string[]; ativo: boolean;
      } | null;

      if (profile) {
        if (!profile.ativo) {
          // Deactivated user — force sign out
          await supabase.auth.signOut();
          resetState();
          return;
        }

        const p = profile.perfil as string;
        const derivedRole = p === 'admin' ? 'admin' : 'funcionario';
        setNome(profile.nome);
        setUsername(profile.username);
        setPerfil(p);
        setRole(derivedRole);
        setPermissoes((profile.permissoes as string[]) || []);
        await loadPostoData(p === 'admin', (profile.posto_ids as string[]) || []);
        return;
      }

      // Legacy fallback: user_roles + user_posto (existing admin accounts without a profile)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .limit(1);
      const userRole = (roles?.[0]?.role ?? null) as 'admin' | 'funcionario' | null;
      setRole(userRole);
      setPerfil(userRole);
      setNome(null);
      setUsername(null);

      if (userRole === 'admin') {
        // Give legacy admin full permissions
        setPermissoes(PROFILE_PRESETS.admin);
        await loadPostoData(true, []);
      } else {
        setPermissoes([]);
        const { data: links } = await supabase
          .from('user_posto')
          .select('posto_id')
          .eq('user_id', userId);
        const assignedPostoIds = (links || []).map((l) => l.posto_id).filter(Boolean) as string[];
        await loadPostoData(false, assignedPostoIds);
      }
    },
    [loadPostoData, resetState]
  );

  const syncSession = useCallback(
    async (sessionUser: User | null) => {
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
    },
    [loadUserData, resetState]
  );

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (isMounted) await syncSession(session?.user ?? null);
    };

    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      queueMicrotask(() => {
        if (isMounted) void syncSession(session?.user ?? null);
      });
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncSession]);

  const signOut = async () => { await supabase.auth.signOut(); };

  const hasPermission = useCallback(
    (key: string) => permissoes.includes(key),
    [permissoes]
  );

  return (
    <AuthContext.Provider value={{
      user, role, perfil, nome, username,
      postoId, postoNome, allPostos,
      selectedPostoId,
      setSelectedPostoId: setSelectedPostoIdState as (id: string) => void,
      permissoes, hasPermission,
      loading, signOut,
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
