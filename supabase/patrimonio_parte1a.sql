-- ============================================================
-- Módulo de Patrimônio — PARTE 1A: Banco de Dados
-- Gerado em: 2026-06-17
-- REVISAR e rodar manualmente no Supabase SQL Editor
-- ============================================================


-- ─── 1. TABELA: itens_patrimonio ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.itens_patrimonio (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text        NOT NULL,
  categoria       text,
  tipo_item       text,
  codigo          text,
  descricao       text,
  posto_atual_id  uuid        REFERENCES public.postos(id) ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT 'disponivel',
  valor           numeric,
  foto_path       text,
  foto_name       text,
  foto_type       text,
  criado_por_nome text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT itens_patrimonio_categoria_check
    CHECK (categoria IS NULL OR categoria IN ('ferramenta', 'equipamento', 'material')),

  CONSTRAINT itens_patrimonio_status_check
    CHECK (status IN ('disponivel', 'em_uso', 'em_manutencao', 'baixado'))
);

ALTER TABLE public.itens_patrimonio ENABLE ROW LEVEL SECURITY;

-- Trigger de updated_at (reutiliza função existente do projeto)
CREATE OR REPLACE TRIGGER itens_patrimonio_updated_at
  BEFORE UPDATE ON public.itens_patrimonio
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ─── 2. RLS: itens_patrimonio (multi-posto) ──────────────────────────────────

-- Admins e masters têm acesso total
DROP POLICY IF EXISTS "Admins can manage all patrimonio" ON public.itens_patrimonio;
CREATE POLICY "Admins can manage all patrimonio"
  ON public.itens_patrimonio
  FOR ALL
  TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Usuários comuns: acesso se posto_atual_id estiver entre os postos autorizados.
-- Combina user_posto (registro legado, 1 posto) e user_profiles.posto_ids (multi-posto).
-- Não filtra por criador — qualquer usuário autorizado no posto pode ver/editar.
DROP POLICY IF EXISTS "Users can manage own posto patrimonio" ON public.itens_patrimonio;
CREATE POLICY "Users can manage own posto patrimonio"
  ON public.itens_patrimonio
  FOR ALL
  TO authenticated
  USING (
    posto_atual_id IN (
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
    posto_atual_id IN (
      SELECT up.posto_id
        FROM public.user_posto up
       WHERE up.user_id = auth.uid()
      UNION
      SELECT unnest(prof.posto_ids)::uuid
        FROM public.user_profiles prof
       WHERE prof.user_id = auth.uid()
    )
  );


-- ─── 3. LISTA CONFIGURÁVEL: tipos_patrimonio ─────────────────────────────────
-- A tabela listas_configuracoes já existe. Nenhum DDL necessário.
-- A lista começa vazia; o admin adiciona itens em Configurações.
-- Chave da lista: 'tipos_patrimonio'
--
-- AÇÃO NECESSÁRIA NA PARTE 1B (telas):
--   Adicionar ao array LISTAS em src/pages/Configuracoes.tsx:
--   { key: 'tipos_patrimonio', label: 'Tipos de Patrimônio',
--     hint: 'Usado no cadastro de itens do patrimônio da rede' }


-- ─── 4. STORAGE: bucket "manutencao" ─────────────────────────────────────────
-- Subpasta usada pelo módulo: patrimonio/{posto_id}/

INSERT INTO storage.buckets (id, name, public)
VALUES ('manutencao', 'manutencao', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage: acesso restrito a usuários autenticados
-- (mesmo padrão de documentos-comprovantes e pessoal-documentos)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'Authenticated can upload to manutencao'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can upload to manutencao"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'manutencao')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'Authenticated can read manutencao'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can read manutencao"
        ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'manutencao')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'Authenticated can update manutencao'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can update manutencao"
        ON storage.objects FOR UPDATE TO authenticated
        USING      (bucket_id = 'manutencao')
        WITH CHECK (bucket_id = 'manutencao')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'Authenticated can delete manutencao'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated can delete manutencao"
        ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'manutencao')
    $p$;
  END IF;
END $$;


-- ─── 5. RELOAD SCHEMA ────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
