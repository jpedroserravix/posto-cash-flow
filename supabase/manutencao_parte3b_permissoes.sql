-- ============================================================
-- Módulo de Manutenção — ETAPA 3B: Permissão 'chamados'
-- Adicionar permissão 'chamados' aos perfis master, admin e gerente
-- Rodar manualmente no Supabase SQL Editor
-- ============================================================

-- Adiciona 'chamados' ao array de permissões para todos os usuários
-- que têm perfil master, admin ou gerente (e ainda não têm a permissão).

UPDATE public.user_profiles
SET permissoes = array_append(permissoes, 'chamados')
WHERE perfil IN ('master', 'admin', 'gerente')
  AND NOT ('chamados' = ANY(permissoes));

-- Verificar resultado:
-- SELECT perfil, permissoes FROM public.user_profiles ORDER BY perfil;

NOTIFY pgrst, 'reload schema';
