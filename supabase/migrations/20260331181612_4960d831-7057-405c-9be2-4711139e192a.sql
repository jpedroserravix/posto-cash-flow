ALTER TABLE public.depositos_manuais 
  ADD COLUMN conferido text NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN conciliado_banco_id uuid REFERENCES public.contas_bancarias(id);