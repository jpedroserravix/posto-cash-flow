-- ============================================================
-- Módulo de Conciliação Pix — Etapa 1: Banco de Dados
-- Gerado em: 2026-07-09
-- REVISAR e rodar manualmente no Supabase SQL Editor
-- ============================================================
--
-- Padrão de RLS usado em todas as tabelas com posto_id direto:
--   Admin  → has_role(auth.uid(), 'admin'::app_role)
--   Usuário → posto_id IN (
--               SELECT up.posto_id FROM public.user_posto up
--                WHERE up.user_id = auth.uid()
--               UNION
--               SELECT unnest(prof.posto_ids)::uuid
--                 FROM public.user_profiles prof
--                WHERE prof.user_id = auth.uid()
--             )
-- Tabelas sem posto_id direto (pix_fechamentos_turnos) acessam
-- o posto_id via JOIN na tabela pai.
-- ============================================================


-- ─── 1. TABELA: pix_importacoes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pix_importacoes (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id         uuid          NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  file_path        text          NOT NULL,
  file_name        text          NOT NULL,
  periodo_inicio   date          NOT NULL,
  periodo_fim      date          NOT NULL,
  total_transacoes int           NOT NULL DEFAULT 0,
  criado_em        timestamptz   NOT NULL DEFAULT now(),
  criado_por_nome  text
);

ALTER TABLE public.pix_importacoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pix_importacoes_posto_id_idx
  ON public.pix_importacoes (posto_id);

CREATE INDEX IF NOT EXISTS pix_importacoes_periodo_idx
  ON public.pix_importacoes (posto_id, periodo_inicio, periodo_fim);


-- ─── 2. TABELA: pix_transacoes ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pix_transacoes (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id         uuid          NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  importacao_id    uuid          NOT NULL REFERENCES public.pix_importacoes(id) ON DELETE CASCADE,
  transacao_id     text          NOT NULL UNIQUE,   -- UUID do extrato; chave de deduplicação
  data_hora        timestamptz   NOT NULL,
  valor_bruto      numeric(12,2) NOT NULL,
  tarifa           numeric(12,2) NOT NULL DEFAULT 0,
  tarifa_esperada  numeric(12,2) NOT NULL DEFAULT 0,
  nome_pagador     text,
  nome_funcionario text,
  pdv              text,
  turno_override   int,                             -- preenchido ao mover manualmente de turno
  movido_por_nome  text
);

ALTER TABLE public.pix_transacoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pix_transacoes_posto_id_idx
  ON public.pix_transacoes (posto_id);

CREATE INDEX IF NOT EXISTS pix_transacoes_importacao_id_idx
  ON public.pix_transacoes (importacao_id);

CREATE INDEX IF NOT EXISTS pix_transacoes_data_hora_idx
  ON public.pix_transacoes (posto_id, data_hora);


-- ─── 3. TABELA: pix_fechamentos ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pix_fechamentos (
  id        uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id  uuid          NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  data      date          NOT NULL,
  status    text          NOT NULL DEFAULT 'pendente',
  criado_em timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT pix_fechamentos_status_check
    CHECK (status IN ('pendente', 'conferido', 'divergente')),

  CONSTRAINT pix_fechamentos_posto_data_unique
    UNIQUE (posto_id, data)
);

ALTER TABLE public.pix_fechamentos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pix_fechamentos_posto_id_idx
  ON public.pix_fechamentos (posto_id);

CREATE INDEX IF NOT EXISTS pix_fechamentos_data_idx
  ON public.pix_fechamentos (posto_id, data);


-- ─── 4. TABELA: pix_fechamentos_turnos ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pix_fechamentos_turnos (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id   uuid          NOT NULL REFERENCES public.pix_fechamentos(id) ON DELETE CASCADE,
  numero_turno    int           NOT NULL,
  hora_corte      time          NOT NULL,   -- hora da última venda do turno
  total_calculado numeric(12,2) NOT NULL DEFAULT 0,
  status          text          NOT NULL DEFAULT 'pendente',
  observacao      text,

  CONSTRAINT pix_fechamentos_turnos_status_check
    CHECK (status IN ('pendente', 'conferido', 'divergente'))
);

ALTER TABLE public.pix_fechamentos_turnos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pix_fechamentos_turnos_fechamento_id_idx
  ON public.pix_fechamentos_turnos (fechamento_id);


-- ─── 5. TABELA: pix_repasses ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pix_repasses (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id       uuid          NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  data_hora      timestamptz   NOT NULL,
  valor          numeric(12,2) NOT NULL,
  dia_referencia date          NOT NULL,
  valor_esperado numeric(12,2) NOT NULL,
  status         text          NOT NULL DEFAULT 'pendente',

  CONSTRAINT pix_repasses_status_check
    CHECK (status IN ('pendente', 'conferido', 'divergente')),

  CONSTRAINT pix_repasses_posto_data_hora_unique
    UNIQUE (posto_id, data_hora)
);

ALTER TABLE public.pix_repasses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pix_repasses_posto_id_idx
  ON public.pix_repasses (posto_id);

CREATE INDEX IF NOT EXISTS pix_repasses_dia_referencia_idx
  ON public.pix_repasses (posto_id, dia_referencia);


-- ─── 6. TABELA: pix_config ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pix_config (
  posto_id          uuid         PRIMARY KEY REFERENCES public.postos(id) ON DELETE CASCADE,
  tarifa_percentual numeric(6,4) NOT NULL DEFAULT 0.2,   -- 0.20% por transação
  tarifa_minima     numeric(6,2) NOT NULL DEFAULT 0.15   -- R$0,15 mínimo por transação
);

ALTER TABLE public.pix_config ENABLE ROW LEVEL SECURITY;


-- ─── 7. RLS: pix_importacoes ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage all pix_importacoes" ON public.pix_importacoes;
CREATE POLICY "Admins can manage all pix_importacoes"
  ON public.pix_importacoes
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own posto pix_importacoes" ON public.pix_importacoes;
CREATE POLICY "Users can manage own posto pix_importacoes"
  ON public.pix_importacoes
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


-- ─── 8. RLS: pix_transacoes ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage all pix_transacoes" ON public.pix_transacoes;
CREATE POLICY "Admins can manage all pix_transacoes"
  ON public.pix_transacoes
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own posto pix_transacoes" ON public.pix_transacoes;
CREATE POLICY "Users can manage own posto pix_transacoes"
  ON public.pix_transacoes
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


-- ─── 9. RLS: pix_fechamentos ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage all pix_fechamentos" ON public.pix_fechamentos;
CREATE POLICY "Admins can manage all pix_fechamentos"
  ON public.pix_fechamentos
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own posto pix_fechamentos" ON public.pix_fechamentos;
CREATE POLICY "Users can manage own posto pix_fechamentos"
  ON public.pix_fechamentos
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


-- ─── 10. RLS: pix_fechamentos_turnos ─────────────────────────────────────────
-- Não tem posto_id direto: acesso filtrado pelo posto_id do fechamento pai.

DROP POLICY IF EXISTS "Admins can manage all pix_fechamentos_turnos" ON public.pix_fechamentos_turnos;
CREATE POLICY "Admins can manage all pix_fechamentos_turnos"
  ON public.pix_fechamentos_turnos
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own posto pix_fechamentos_turnos" ON public.pix_fechamentos_turnos;
CREATE POLICY "Users can manage own posto pix_fechamentos_turnos"
  ON public.pix_fechamentos_turnos
  FOR ALL
  TO authenticated
  USING (
    fechamento_id IN (
      SELECT id
        FROM public.pix_fechamentos
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
  )
  WITH CHECK (
    fechamento_id IN (
      SELECT id
        FROM public.pix_fechamentos
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


-- ─── 11. RLS: pix_repasses ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage all pix_repasses" ON public.pix_repasses;
CREATE POLICY "Admins can manage all pix_repasses"
  ON public.pix_repasses
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can manage own posto pix_repasses" ON public.pix_repasses;
CREATE POLICY "Users can manage own posto pix_repasses"
  ON public.pix_repasses
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


-- ─── 12. RLS: pix_config ─────────────────────────────────────────────────────
-- Escrita restrita a admin; usuários têm apenas leitura (para calcular tarifas esperadas).

DROP POLICY IF EXISTS "Admins can manage all pix_config" ON public.pix_config;
CREATE POLICY "Admins can manage all pix_config"
  ON public.pix_config
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can read own posto pix_config" ON public.pix_config;
CREATE POLICY "Users can read own posto pix_config"
  ON public.pix_config
  FOR SELECT
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
  );


-- ─── 13. STORAGE: bucket "pix-extratos" ──────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('pix-extratos', 'pix-extratos', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'Authenticated can upload to pix-extratos'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can upload to pix-extratos"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'pix-extratos')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'Authenticated can read pix-extratos'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can read pix-extratos"
        ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'pix-extratos')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'Authenticated can update pix-extratos'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can update pix-extratos"
        ON storage.objects FOR UPDATE TO authenticated
        USING      (bucket_id = 'pix-extratos')
        WITH CHECK (bucket_id = 'pix-extratos')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'Authenticated can delete pix-extratos'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can delete pix-extratos"
        ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'pix-extratos')
    $p$;
  END IF;
END $$;


-- ─── 14. PERMISSÃO: conciliacao-pix ──────────────────────────────────────────
-- Módulo financeiro: disponível apenas para master e admin.
-- Gerente não recebe esta permissão por padrão.
-- AÇÃO PENDENTE (Etapa 2 — frontend):
--   Adicionar { key: 'conciliacao-pix', label: 'Conciliação Pix' } em permissions.ts
--   e a rota correspondente em ROUTE_PERMISSION_MAP.

UPDATE public.user_profiles
SET permissoes = array_append(permissoes, 'conciliacao-pix')
WHERE perfil IN ('master', 'admin')
  AND NOT ('conciliacao-pix' = ANY(permissoes));


-- ─── 15. RELOAD SCHEMA ───────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
