
ALTER TABLE public.resumo_conferencia DROP CONSTRAINT IF EXISTS resumo_conferencia_posto_id_data_turno_centro_custo_key;
ALTER TABLE public.resumo_conferencia ALTER COLUMN turno DROP NOT NULL;
ALTER TABLE public.resumo_conferencia ADD CONSTRAINT resumo_conferencia_posto_data_centro_custo_key UNIQUE (posto_id, data, centro_custo);
