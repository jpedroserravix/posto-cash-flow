-- ============================================================
-- Módulo de Cartões — Etapa 1: Banco de Dados
-- Gerado em: 2026-07-14
-- REVISAR e rodar manualmente no Supabase SQL Editor
-- ============================================================
--
-- Padrão de RLS das tabelas com posto_id:
--   Admin  → has_role(auth.uid(), 'admin'::app_role)
--   Usuário → posto_id IN (
--               SELECT up.posto_id FROM public.user_posto up
--                WHERE up.user_id = auth.uid()
--               UNION
--               SELECT unnest(prof.posto_ids)::uuid
--                 FROM public.user_profiles prof
--                WHERE prof.user_id = auth.uid()
--             )
-- Tabela de configuração (sem posto_id): admin gerencia, autenticados lêem.
-- ============================================================


-- ─── 1. TABELA: cartoes_config_modalidades ───────────────────────────────────
-- Configuração global de adquirentes: taxas, prazos e condições de recebimento.

CREATE TABLE IF NOT EXISTS public.cartoes_config_modalidades (
  id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  adquirente            text           NOT NULL,
  forma_pagamento       text           NOT NULL,
  modalidade            text           NOT NULL,
  condicao_recebimento  text           NOT NULL,
  prazo_tipo            text           NOT NULL,
  prazo_dias            int,
  taxa_pct              numeric(6,3)   NOT NULL,
  ativo                 boolean        NOT NULL DEFAULT true,
  created_at            timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT cartoes_config_modalidades_prazo_tipo_check
    CHECK (prazo_tipo IN ('dias_corridos', 'quinto_dia_util_mes_seguinte')),

  CONSTRAINT cartoes_config_modalidades_adquirente_forma_unique
    UNIQUE (adquirente, forma_pagamento)
);

ALTER TABLE public.cartoes_config_modalidades ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cartoes_config_modalidades_adquirente_idx
  ON public.cartoes_config_modalidades (adquirente);

CREATE INDEX IF NOT EXISTS cartoes_config_modalidades_ativo_idx
  ON public.cartoes_config_modalidades (ativo);


-- ─── 2. TABELA: cartoes_vendas ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cartoes_vendas (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id          uuid           NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  adquirente        text           NOT NULL,
  cpf               text,
  nome              text,
  produto           text,
  valor_bruto       numeric(12,2)  NOT NULL,
  data_transacao    timestamptz    NOT NULL,
  codigo_transacao  text           NOT NULL,
  forma_pagamento   text,
  status            text,
  importado_por     uuid           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT cartoes_vendas_adquirente_codigo_unique
    UNIQUE (adquirente, codigo_transacao)
);

ALTER TABLE public.cartoes_vendas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cartoes_vendas_posto_id_idx
  ON public.cartoes_vendas (posto_id);

CREATE INDEX IF NOT EXISTS cartoes_vendas_adquirente_idx
  ON public.cartoes_vendas (posto_id, adquirente);

CREATE INDEX IF NOT EXISTS cartoes_vendas_data_transacao_idx
  ON public.cartoes_vendas (posto_id, data_transacao);


-- ─── 3. TABELA: cartoes_recebiveis ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cartoes_recebiveis (
  id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id                uuid           NOT NULL REFERENCES public.cartoes_vendas(id) ON DELETE CASCADE,
  posto_id                uuid           NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  adquirente              text           NOT NULL,
  modalidade              text           NOT NULL,
  condicao_recebimento    text           NOT NULL,
  data_transacao          date           NOT NULL,
  valor_bruto             numeric(12,2)  NOT NULL,
  taxa_pct                numeric(6,3)   NOT NULL,
  valor_desconto          numeric(12,2)  NOT NULL,
  valor_liquido           numeric(12,2)  NOT NULL,
  data_prevista_credito   date           NOT NULL,
  status_recebimento      text           NOT NULL DEFAULT 'pendente',
  data_recebimento_real   date,
  created_at              timestamptz    NOT NULL DEFAULT now(),

  CONSTRAINT cartoes_recebiveis_status_recebimento_check
    CHECK (status_recebimento IN ('pendente', 'recebido'))
);

ALTER TABLE public.cartoes_recebiveis ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cartoes_recebiveis_posto_id_idx
  ON public.cartoes_recebiveis (posto_id);

CREATE INDEX IF NOT EXISTS cartoes_recebiveis_venda_id_idx
  ON public.cartoes_recebiveis (venda_id);

CREATE INDEX IF NOT EXISTS cartoes_recebiveis_data_prevista_idx
  ON public.cartoes_recebiveis (posto_id, data_prevista_credito);

CREATE INDEX IF NOT EXISTS cartoes_recebiveis_status_idx
  ON public.cartoes_recebiveis (posto_id, status_recebimento);


-- ─── 4. SEED: cartoes_config_modalidades (Premmia) ───────────────────────────

INSERT INTO public.cartoes_config_modalidades
  (adquirente, forma_pagamento, modalidade, condicao_recebimento, prazo_tipo, prazo_dias, taxa_pct)
VALUES
  ('Premmia', 'Cartão APP', 'Crédito',   'D31',  'dias_corridos',                    31,   2.10),
  ('Premmia', 'Pix',        'Pix',        'D01',  'dias_corridos',                    1,    0.89),
  ('Premmia', 'Desconto',   'Desconto',   'D05U', 'quinto_dia_util_mes_seguinte',     null, 2.10)
ON CONFLICT (adquirente, forma_pagamento) DO NOTHING;


-- ─── 5. RLS: cartoes_config_modalidades ──────────────────────────────────────
-- Configuração global: admin gerencia, todos os autenticados lêem.

DROP POLICY IF EXISTS "Admins can manage all cartoes_config_modalidades" ON public.cartoes_config_modalidades;
CREATE POLICY "Admins can manage all cartoes_config_modalidades"
  ON public.cartoes_config_modalidades
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can read cartoes_config_modalidades" ON public.cartoes_config_modalidades;
CREATE POLICY "Authenticated can read cartoes_config_modalidades"
  ON public.cartoes_config_modalidades
  FOR SELECT
  TO authenticated
  USING (true);


-- ─── 6. RLS: cartoes_vendas ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage all cartoes_vendas" ON public.cartoes_vendas;
CREATE POLICY "Admins can manage all cartoes_vendas"
  ON public.cartoes_vendas
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own posto cartoes_vendas" ON public.cartoes_vendas;
CREATE POLICY "Users can manage own posto cartoes_vendas"
  ON public.cartoes_vendas
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


-- ─── 7. RLS: cartoes_recebiveis ──────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage all cartoes_recebiveis" ON public.cartoes_recebiveis;
CREATE POLICY "Admins can manage all cartoes_recebiveis"
  ON public.cartoes_recebiveis
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own posto cartoes_recebiveis" ON public.cartoes_recebiveis;
CREATE POLICY "Users can manage own posto cartoes_recebiveis"
  ON public.cartoes_recebiveis
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


-- ─── 8. RELOAD SCHEMA ────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
