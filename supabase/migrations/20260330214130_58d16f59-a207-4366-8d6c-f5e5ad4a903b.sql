
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'funcionario');

-- Create postos table
CREATE TABLE public.postos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.postos ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create user_posto table (link user to posto)
CREATE TABLE public.user_posto (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  posto_id UUID REFERENCES public.postos(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (user_id, posto_id)
);
ALTER TABLE public.user_posto ENABLE ROW LEVEL SECURITY;

-- Create depositos_brinks table
CREATE TABLE public.depositos_brinks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  posto_id UUID REFERENCES public.postos(id) ON DELETE CASCADE NOT NULL,
  lote_id UUID NOT NULL,
  data_deposito TIMESTAMP WITH TIME ZONE NOT NULL,
  moeda TEXT NOT NULL,
  valor NUMERIC(15,2) NOT NULL,
  tipo TEXT NOT NULL,
  depositante TEXT NOT NULL,
  data_caixa DATE,
  turno TEXT,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.depositos_brinks ENABLE ROW LEVEL SECURITY;

-- Create conciliacao_brinks (per batch)
CREATE TABLE public.conciliacao_brinks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  posto_id UUID REFERENCES public.postos(id) ON DELETE CASCADE NOT NULL,
  lote_id UUID NOT NULL UNIQUE,
  total_brinks NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_banco NUMERIC(15,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.conciliacao_brinks ENABLE ROW LEVEL SECURITY;

-- Create depositos_manuais table
CREATE TABLE public.depositos_manuais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  posto_id UUID REFERENCES public.postos(id) ON DELETE CASCADE NOT NULL,
  data DATE NOT NULL,
  turno TEXT NOT NULL,
  valor_lancado NUMERIC(15,2) NOT NULL,
  valor_depositado NUMERIC(15,2),
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.depositos_manuais ENABLE ROW LEVEL SECURITY;

-- Create resumo_conferencia table
CREATE TABLE public.resumo_conferencia (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  posto_id UUID REFERENCES public.postos(id) ON DELETE CASCADE NOT NULL,
  data DATE NOT NULL,
  turno TEXT NOT NULL,
  conferido TEXT NOT NULL DEFAULT 'PENDENTE',
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (posto_id, data, turno)
);
ALTER TABLE public.resumo_conferencia ENABLE ROW LEVEL SECURITY;

-- Security definer function for role check
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Security definer function to get user posto_id
CREATE OR REPLACE FUNCTION public.get_user_posto_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT posto_id FROM public.user_posto
  WHERE user_id = _user_id LIMIT 1
$$;

-- RLS policies for postos
CREATE POLICY "Admins can manage postos" ON public.postos FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their posto" ON public.postos FOR SELECT
  TO authenticated USING (id = public.get_user_posto_id(auth.uid()));

-- RLS policies for user_roles
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- RLS policies for user_posto
CREATE POLICY "Admins can manage user_posto" ON public.user_posto FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own posto link" ON public.user_posto FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- RLS policies for depositos_brinks
CREATE POLICY "Admins can manage all brinks" ON public.depositos_brinks FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage own posto brinks" ON public.depositos_brinks FOR ALL
  TO authenticated USING (posto_id = public.get_user_posto_id(auth.uid()));

-- RLS policies for conciliacao_brinks
CREATE POLICY "Only admins can manage conciliacao" ON public.conciliacao_brinks FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for depositos_manuais
CREATE POLICY "Admins can manage all manuais" ON public.depositos_manuais FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage own posto manuais" ON public.depositos_manuais FOR ALL
  TO authenticated USING (posto_id = public.get_user_posto_id(auth.uid()));

-- RLS policies for resumo_conferencia
CREATE POLICY "Admins can manage all resumo" ON public.resumo_conferencia FOR ALL
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage own posto resumo" ON public.resumo_conferencia FOR ALL
  TO authenticated USING (posto_id = public.get_user_posto_id(auth.uid()));

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;
