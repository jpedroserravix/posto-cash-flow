-- ============================================================
-- Módulo de Patrimônio — PARTE 2A: Movimentação entre Postos
-- Gerado em: 2026-06-17
-- REVISAR e rodar manualmente no Supabase SQL Editor
-- ============================================================


-- ─── 1. TABELA: itens_movimentacoes ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.itens_movimentacoes (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          uuid        NOT NULL
                               REFERENCES public.itens_patrimonio(id) ON DELETE CASCADE,
  posto_origem_id  uuid        REFERENCES public.postos(id) ON DELETE SET NULL,
  posto_destino_id uuid        NOT NULL REFERENCES public.postos(id) ON DELETE RESTRICT,
  movido_por_nome  text,
  observacao       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.itens_movimentacoes ENABLE ROW LEVEL SECURITY;

-- Índices para as buscas mais comuns
CREATE INDEX IF NOT EXISTS itens_movimentacoes_item_id_idx
  ON public.itens_movimentacoes (item_id);

CREATE INDEX IF NOT EXISTS itens_movimentacoes_posto_destino_idx
  ON public.itens_movimentacoes (posto_destino_id);


-- ─── 2. TRIGGER: sincronizar posto_atual_id após movimentação ─────────────────
-- Atualiza itens_patrimonio.posto_atual_id e updated_at sempre que
-- uma nova movimentação é registrada.

CREATE OR REPLACE FUNCTION public.fn_sync_item_posto_apos_movimentacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.itens_patrimonio
     SET posto_atual_id = NEW.posto_destino_id,
         updated_at     = now()
   WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;

-- Drop e recria o trigger para garantir idempotência
DROP TRIGGER IF EXISTS itens_movimentacoes_sync_posto ON public.itens_movimentacoes;

CREATE TRIGGER itens_movimentacoes_sync_posto
  AFTER INSERT ON public.itens_movimentacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_item_posto_apos_movimentacao();


-- ─── 3. RLS: itens_movimentacoes (multi-posto) ───────────────────────────────
-- Movimentações são log imutável: apenas SELECT e INSERT para usuários comuns.
-- UPDATE e DELETE são cobertos pela política de admin (acesso total).

-- Subquery reutilizada nas políticas de usuário comum:
-- retorna todos os posto_ids autorizados ao usuário autenticado
-- (UNION de user_posto legado + user_profiles.posto_ids multi-posto)

-- ── Admin: acesso total ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage all movimentacoes" ON public.itens_movimentacoes;
CREATE POLICY "Admins can manage all movimentacoes"
  ON public.itens_movimentacoes
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ── SELECT: visível se usuário tem acesso ao posto de origem OU de destino ───
DROP POLICY IF EXISTS "Users can view movimentacoes of own postos" ON public.itens_movimentacoes;
CREATE POLICY "Users can view movimentacoes of own postos"
  ON public.itens_movimentacoes
  FOR SELECT
  TO authenticated
  USING (
    posto_destino_id IN (
      SELECT up.posto_id
        FROM public.user_posto up
       WHERE up.user_id = auth.uid()
      UNION
      SELECT unnest(prof.posto_ids)::uuid
        FROM public.user_profiles prof
       WHERE prof.user_id = auth.uid()
    )
    OR
    posto_origem_id IN (
      SELECT up.posto_id
        FROM public.user_posto up
       WHERE up.user_id = auth.uid()
      UNION
      SELECT unnest(prof.posto_ids)::uuid
        FROM public.user_profiles prof
       WHERE prof.user_id = auth.uid()
    )
  );

-- ── INSERT: permitido apenas para quem tem acesso ao posto de destino ─────────
DROP POLICY IF EXISTS "Users can insert movimentacoes to own postos" ON public.itens_movimentacoes;
CREATE POLICY "Users can insert movimentacoes to own postos"
  ON public.itens_movimentacoes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_destino_id IN (
      SELECT up.posto_id
        FROM public.user_posto up
       WHERE up.user_id = auth.uid()
      UNION
      SELECT unnest(prof.posto_ids)::uuid
        FROM public.user_profiles prof
       WHERE prof.user_id = auth.uid()
    )
  );


-- ─── 4. RELOAD SCHEMA ────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
