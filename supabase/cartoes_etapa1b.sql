-- ============================================================
-- Módulo de Cartões — Etapa 1b: Funções e Trigger
-- Gerado em: 2026-07-14
-- Pré-requisito: cartoes_etapa1.sql já executado
-- REVISAR e rodar manualmente no Supabase SQL Editor
-- ============================================================


-- ─── 1. FUNÇÃO: calc_quinto_dia_util ─────────────────────────────────────────
-- Retorna o 5º dia útil (segunda a sexta) do mês seguinte ao mês de data_ref.
-- Não exclui feriados (sem tabela de feriados no schema).
-- IMMUTABLE: apenas aritmética de datas, sem leitura de tabelas.
--
-- Exemplo: calc_quinto_dia_util('2026-07-15') → '2026-08-07'
--   Ago/2026: sáb 1, dom 2, seg 3(1), ter 4(2), qua 5(3), qui 6(4), sex 7(5) ✓

CREATE OR REPLACE FUNCTION public.calc_quinto_dia_util(data_ref date)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_dia    date;
  v_count  int := 0;
BEGIN
  -- Primeiro dia do mês seguinte
  v_dia := date_trunc('month', data_ref + interval '1 month')::date;

  LOOP
    -- extract(dow): 0 = domingo, 6 = sábado
    IF extract(dow FROM v_dia) NOT IN (0, 6) THEN
      v_count := v_count + 1;
      IF v_count = 5 THEN
        RETURN v_dia;
      END IF;
    END IF;
    v_dia := v_dia + 1;
  END LOOP;
END;
$$;


-- ─── 2. FUNÇÃO: gerar_recebivel_cartao (trigger) ─────────────────────────────
-- Dispara AFTER INSERT em cartoes_vendas.
-- Busca a configuração de modalidade (taxa, prazo, condição) em
-- cartoes_config_modalidades e insere automaticamente o recebível calculado
-- em cartoes_recebiveis.
-- SECURITY DEFINER: garante permissão de escrita em cartoes_recebiveis
-- independentemente do role do chamador, desde que a venda tenha sido inserida.

CREATE OR REPLACE FUNCTION public.gerar_recebivel_cartao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg              record;
  v_data_prevista    date;
  v_valor_desconto   numeric(12,2);
  v_valor_liquido    numeric(12,2);
BEGIN
  -- 1. Buscar configuração da modalidade
  SELECT *
    INTO v_cfg
    FROM public.cartoes_config_modalidades
   WHERE adquirente     = NEW.adquirente
     AND forma_pagamento = NEW.forma_pagamento
     AND ativo           = true
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Configuração não encontrada para adquirente % / forma %',
      NEW.adquirente, NEW.forma_pagamento;
  END IF;

  -- 2. Calcular data prevista de crédito
  CASE v_cfg.prazo_tipo
    WHEN 'dias_corridos' THEN
      v_data_prevista := NEW.data_transacao::date + v_cfg.prazo_dias;
    WHEN 'quinto_dia_util_mes_seguinte' THEN
      v_data_prevista := public.calc_quinto_dia_util(NEW.data_transacao::date);
    ELSE
      RAISE EXCEPTION 'prazo_tipo desconhecido: %', v_cfg.prazo_tipo;
  END CASE;

  -- 3. Calcular desconto e líquido
  v_valor_desconto := round(NEW.valor_bruto * v_cfg.taxa_pct / 100, 2);
  v_valor_liquido  := NEW.valor_bruto - v_valor_desconto;

  -- 4. Inserir recebível
  INSERT INTO public.cartoes_recebiveis (
    venda_id,
    posto_id,
    adquirente,
    modalidade,
    condicao_recebimento,
    data_transacao,
    valor_bruto,
    taxa_pct,
    valor_desconto,
    valor_liquido,
    data_prevista_credito,
    status_recebimento
  ) VALUES (
    NEW.id,
    NEW.posto_id,
    NEW.adquirente,
    v_cfg.modalidade,
    v_cfg.condicao_recebimento,
    NEW.data_transacao::date,
    NEW.valor_bruto,
    v_cfg.taxa_pct,
    v_valor_desconto,
    v_valor_liquido,
    v_data_prevista,
    'pendente'
  );

  RETURN NEW;
END;
$$;


-- ─── 3. TRIGGER: trg_gerar_recebivel_cartao ──────────────────────────────────

DROP TRIGGER IF EXISTS trg_gerar_recebivel_cartao ON public.cartoes_vendas;

CREATE TRIGGER trg_gerar_recebivel_cartao
  AFTER INSERT ON public.cartoes_vendas
  FOR EACH ROW
  EXECUTE FUNCTION public.gerar_recebivel_cartao();


-- ─── 4. RELOAD SCHEMA ────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
