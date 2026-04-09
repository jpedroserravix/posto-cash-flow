CREATE TABLE public.relatorio_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id),
  data_caixa date NOT NULL,
  total_dinheiro_apurado numeric,
  total_cartao numeric,
  total_pix numeric,
  total_vendas numeric,
  total_despesas numeric,
  diferenca_caixa numeric,
  raw_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (posto_id, data_caixa)
);

ALTER TABLE public.relatorio_quality ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all quality"
ON public.relatorio_quality
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage own posto quality"
ON public.relatorio_quality
FOR ALL
TO authenticated
USING (posto_id = get_user_posto_id(auth.uid()))
WITH CHECK (posto_id = get_user_posto_id(auth.uid()));