
-- Create contas_bancarias table
CREATE TABLE public.contas_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  banco text NOT NULL,
  agencia text NOT NULL,
  conta text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contas_bancarias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage contas_bancarias"
  ON public.contas_bancarias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own posto contas"
  ON public.contas_bancarias FOR SELECT TO authenticated
  USING (posto_id = public.get_user_posto_id(auth.uid()));

-- Add conciliado_banco_id column to depositos_brinks
ALTER TABLE public.depositos_brinks
  ADD COLUMN conciliado_banco_id uuid REFERENCES public.contas_bancarias(id);
