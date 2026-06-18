-- ============================================================
-- Módulo de Manutenção — ETAPA 3A: Chamados Kanban (banco)
-- Gerado em: 2026-06-17
-- REVISAR e rodar manualmente no Supabase SQL Editor
-- ============================================================


-- ─── 0. GARANTIR função update_updated_at_column ─────────────────────────────
-- Já existe no projeto, mas o CREATE OR REPLACE é seguro e idempotente.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ─── 1. TABELA: manutencao_chamados ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.manutencao_chamados (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id          uuid        NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  titulo            text        NOT NULL,
  descricao         text,
  categoria         text,                         -- lista configurável 'categorias_manutencao'
  prioridade        text        NOT NULL DEFAULT 'media',
  status            text        NOT NULL DEFAULT 'aberto',
  responsavel_nome  text,
  custo             numeric,
  foto_path         text,
  foto_name         text,
  foto_type         text,
  criado_por_nome   text,
  concluido_em      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT manutencao_chamados_prioridade_check
    CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),

  CONSTRAINT manutencao_chamados_status_check
    CHECK (status IN ('aberto', 'em_andamento', 'concluido'))
);

ALTER TABLE public.manutencao_chamados ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS manutencao_chamados_posto_id_idx
  ON public.manutencao_chamados (posto_id);

CREATE INDEX IF NOT EXISTS manutencao_chamados_status_idx
  ON public.manutencao_chamados (status);

-- Trigger de updated_at
DROP TRIGGER IF EXISTS manutencao_chamados_updated_at ON public.manutencao_chamados;
CREATE TRIGGER manutencao_chamados_updated_at
  BEFORE UPDATE ON public.manutencao_chamados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─── 2. TABELA: manutencao_chamados_historico ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.manutencao_chamados_historico (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado_id        uuid        NOT NULL
                                REFERENCES public.manutencao_chamados(id) ON DELETE CASCADE,
  status_anterior   text,
  status_novo       text,
  alterado_por_nome text,
  observacao        text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manutencao_chamados_historico ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS manutencao_chamados_historico_chamado_id_idx
  ON public.manutencao_chamados_historico (chamado_id);


-- ─── 3. RLS: manutencao_chamados ─────────────────────────────────────────────

-- Admin: acesso total
DROP POLICY IF EXISTS "Admins can manage all chamados" ON public.manutencao_chamados;
CREATE POLICY "Admins can manage all chamados"
  ON public.manutencao_chamados
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Usuários comuns: acesso quando posto_id estiver entre os postos autorizados
DROP POLICY IF EXISTS "Users can manage own posto chamados" ON public.manutencao_chamados;
CREATE POLICY "Users can manage own posto chamados"
  ON public.manutencao_chamados
  FOR ALL
  TO authenticated
  USING (
    posto_id IN (
      SELECT up.posto_id
        FROM public.user_posto up
       WHERE up.user_id = auth.uid()
      UNION
      SELECT unnest(prof.posto_ids)::uuid
        FROM public.user_profiles prof
       WHERE prof.user_id = auth.uid()
    )
  )
  WITH CHECK (
    posto_id IN (
      SELECT up.posto_id
        FROM public.user_posto up
       WHERE up.user_id = auth.uid()
      UNION
      SELECT unnest(prof.posto_ids)::uuid
        FROM public.user_profiles prof
       WHERE prof.user_id = auth.uid()
    )
  );


-- ─── 4. RLS: manutencao_chamados_historico ───────────────────────────────────
-- Acesso concedido quando o chamado pertence a um posto autorizado do usuário.
-- Histórico é append-only para usuários comuns (apenas SELECT + INSERT).

-- Admin: acesso total
DROP POLICY IF EXISTS "Admins can manage all chamados historico" ON public.manutencao_chamados_historico;
CREATE POLICY "Admins can manage all chamados historico"
  ON public.manutencao_chamados_historico
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- SELECT: visível se o chamado pertence a posto autorizado
DROP POLICY IF EXISTS "Users can view historico of own posto chamados" ON public.manutencao_chamados_historico;
CREATE POLICY "Users can view historico of own posto chamados"
  ON public.manutencao_chamados_historico
  FOR SELECT
  TO authenticated
  USING (
    chamado_id IN (
      SELECT id
        FROM public.manutencao_chamados
       WHERE posto_id IN (
         SELECT up.posto_id
           FROM public.user_posto up
          WHERE up.user_id = auth.uid()
         UNION
         SELECT unnest(prof.posto_ids)::uuid
           FROM public.user_profiles prof
          WHERE prof.user_id = auth.uid()
       )
    )
  );

-- INSERT: permitido quando o chamado pertence a posto autorizado
DROP POLICY IF EXISTS "Users can insert historico of own posto chamados" ON public.manutencao_chamados_historico;
CREATE POLICY "Users can insert historico of own posto chamados"
  ON public.manutencao_chamados_historico
  FOR INSERT
  TO authenticated
  WITH CHECK (
    chamado_id IN (
      SELECT id
        FROM public.manutencao_chamados
       WHERE posto_id IN (
         SELECT up.posto_id
           FROM public.user_posto up
          WHERE up.user_id = auth.uid()
         UNION
         SELECT unnest(prof.posto_ids)::uuid
           FROM public.user_profiles prof
          WHERE prof.user_id = auth.uid()
       )
    )
  );


-- ─── 5. RELOAD SCHEMA ────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
