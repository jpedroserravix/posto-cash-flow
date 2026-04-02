
CREATE TABLE public.extrato_bancario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES postos(id),
  conta_bancaria_id uuid NOT NULL REFERENCES contas_bancarias(id),
  fitid text NOT NULL,
  data_lancamento date NOT NULL,
  valor numeric NOT NULL,
  memo text,
  tipo text,
  conciliado boolean NOT NULL DEFAULT false,
  deposito_brinks_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta_bancaria_id, fitid)
);

ALTER TABLE public.extrato_bancario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all extrato" ON public.extrato_bancario
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can manage own posto extrato" ON public.extrato_bancario
  FOR ALL TO authenticated
  USING (posto_id = get_user_posto_id(auth.uid()))
  WITH CHECK (posto_id = get_user_posto_id(auth.uid()));
