-- =============================================================================
-- Cartões: Fechamento por Turno (Premmia e outros adquirentes)
-- Espelha o padrão de pix_fechamentos / pix_fechamentos_turnos
-- Genérico via campo `adquirente` — suporta Premmia e qualquer outro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabela principal de fechamento (1 por posto × data × centro_custo × adquirente)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cartoes_fechamentos (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id      uuid        NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  data          date        NOT NULL,
  centro_custo  text        NOT NULL DEFAULT 'PISTA',
  adquirente    text        NOT NULL,                              -- 'Premmia', 'Cielo', etc.
  status        text        NOT NULL DEFAULT 'pendente'
                            CHECK (status IN ('pendente', 'conferido', 'divergente')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cartoes_fechamentos_unique
    UNIQUE (posto_id, data, centro_custo, adquirente)
);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_cartoes_fechamentos_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cartoes_fechamentos_updated_at ON public.cartoes_fechamentos;
CREATE TRIGGER trg_cartoes_fechamentos_updated_at
  BEFORE UPDATE ON public.cartoes_fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_cartoes_fechamentos_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Tabela de turnos por fechamento (N turnos por fechamento)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cartoes_fechamentos_turnos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id    uuid        NOT NULL
                               REFERENCES public.cartoes_fechamentos(id) ON DELETE CASCADE,
  numero_turno     int         NOT NULL CHECK (numero_turno > 0),
  hora_corte       text        NOT NULL,  -- ex: "08:00" — hora de corte do turno
  total_calculado  numeric(12,2) NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'pendente'
                               CHECK (status IN ('pendente', 'conferido', 'divergente')),
  observacao       text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cartoes_fechamentos_turnos_unique
    UNIQUE (fechamento_id, numero_turno)
);

-- -----------------------------------------------------------------------------
-- 3. Índices de performance
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cartoes_fechamentos_posto_data
  ON public.cartoes_fechamentos (posto_id, data);

CREATE INDEX IF NOT EXISTS idx_cartoes_fechamentos_turnos_fechamento
  ON public.cartoes_fechamentos_turnos (fechamento_id);

-- -----------------------------------------------------------------------------
-- 4. Row-Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.cartoes_fechamentos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartoes_fechamentos_turnos ENABLE ROW LEVEL SECURITY;

-- cartoes_fechamentos — admins vêem tudo; funcionários vêem apenas seu posto
DROP POLICY IF EXISTS "cartoes_fechamentos_select" ON public.cartoes_fechamentos;
CREATE POLICY "cartoes_fechamentos_select"
  ON public.cartoes_fechamentos FOR SELECT
  USING (
    public.has_role('admin', auth.uid())
    OR posto_id = public.get_user_posto_id(auth.uid())
  );

DROP POLICY IF EXISTS "cartoes_fechamentos_insert" ON public.cartoes_fechamentos;
CREATE POLICY "cartoes_fechamentos_insert"
  ON public.cartoes_fechamentos FOR INSERT
  WITH CHECK (
    public.has_role('admin', auth.uid())
    OR posto_id = public.get_user_posto_id(auth.uid())
  );

DROP POLICY IF EXISTS "cartoes_fechamentos_update" ON public.cartoes_fechamentos;
CREATE POLICY "cartoes_fechamentos_update"
  ON public.cartoes_fechamentos FOR UPDATE
  USING (
    public.has_role('admin', auth.uid())
    OR posto_id = public.get_user_posto_id(auth.uid())
  );

DROP POLICY IF EXISTS "cartoes_fechamentos_delete" ON public.cartoes_fechamentos;
CREATE POLICY "cartoes_fechamentos_delete"
  ON public.cartoes_fechamentos FOR DELETE
  USING (
    public.has_role('admin', auth.uid())
    OR posto_id = public.get_user_posto_id(auth.uid())
  );

-- cartoes_fechamentos_turnos — acesso via join ao fechamento pai (verifica posto via subquery)
DROP POLICY IF EXISTS "cartoes_fechamentos_turnos_select" ON public.cartoes_fechamentos_turnos;
CREATE POLICY "cartoes_fechamentos_turnos_select"
  ON public.cartoes_fechamentos_turnos FOR SELECT
  USING (
    public.has_role('admin', auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.cartoes_fechamentos f
      WHERE f.id = fechamento_id
        AND (
          public.has_role('admin', auth.uid())
          OR f.posto_id = public.get_user_posto_id(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "cartoes_fechamentos_turnos_insert" ON public.cartoes_fechamentos_turnos;
CREATE POLICY "cartoes_fechamentos_turnos_insert"
  ON public.cartoes_fechamentos_turnos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cartoes_fechamentos f
      WHERE f.id = fechamento_id
        AND (
          public.has_role('admin', auth.uid())
          OR f.posto_id = public.get_user_posto_id(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "cartoes_fechamentos_turnos_update" ON public.cartoes_fechamentos_turnos;
CREATE POLICY "cartoes_fechamentos_turnos_update"
  ON public.cartoes_fechamentos_turnos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.cartoes_fechamentos f
      WHERE f.id = fechamento_id
        AND (
          public.has_role('admin', auth.uid())
          OR f.posto_id = public.get_user_posto_id(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "cartoes_fechamentos_turnos_delete" ON public.cartoes_fechamentos_turnos;
CREATE POLICY "cartoes_fechamentos_turnos_delete"
  ON public.cartoes_fechamentos_turnos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.cartoes_fechamentos f
      WHERE f.id = fechamento_id
        AND (
          public.has_role('admin', auth.uid())
          OR f.posto_id = public.get_user_posto_id(auth.uid())
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Recarregar schema do PostgREST
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
