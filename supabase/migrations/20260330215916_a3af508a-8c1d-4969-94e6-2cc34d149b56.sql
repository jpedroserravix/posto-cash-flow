
-- Drop existing postos policies and recreate with explicit WITH CHECK
DROP POLICY IF EXISTS "Admins can manage postos" ON public.postos;
CREATE POLICY "Admins can manage postos" ON public.postos FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Fix all other ALL policies similarly
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage user_posto" ON public.user_posto;
CREATE POLICY "Admins can manage user_posto" ON public.user_posto FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage all brinks" ON public.depositos_brinks;
CREATE POLICY "Admins can manage all brinks" ON public.depositos_brinks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can manage own posto brinks" ON public.depositos_brinks;
CREATE POLICY "Users can manage own posto brinks" ON public.depositos_brinks FOR ALL
  TO authenticated
  USING (posto_id = public.get_user_posto_id(auth.uid()))
  WITH CHECK (posto_id = public.get_user_posto_id(auth.uid()));

DROP POLICY IF EXISTS "Only admins can manage conciliacao" ON public.conciliacao_brinks;
CREATE POLICY "Only admins can manage conciliacao" ON public.conciliacao_brinks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage all manuais" ON public.depositos_manuais;
CREATE POLICY "Admins can manage all manuais" ON public.depositos_manuais FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can manage own posto manuais" ON public.depositos_manuais;
CREATE POLICY "Users can manage own posto manuais" ON public.depositos_manuais FOR ALL
  TO authenticated
  USING (posto_id = public.get_user_posto_id(auth.uid()))
  WITH CHECK (posto_id = public.get_user_posto_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all resumo" ON public.resumo_conferencia;
CREATE POLICY "Admins can manage all resumo" ON public.resumo_conferencia FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users can manage own posto resumo" ON public.resumo_conferencia;
CREATE POLICY "Users can manage own posto resumo" ON public.resumo_conferencia FOR ALL
  TO authenticated
  USING (posto_id = public.get_user_posto_id(auth.uid()))
  WITH CHECK (posto_id = public.get_user_posto_id(auth.uid()));
