

# Conciliação Bancária por Período

## Resumo

Substituir a conciliação atual (por lote, com campo único) por uma conciliação por período de datas, onde o administrador seleciona data inicial/final, o sistema soma os depósitos Brinks desse período (excluindo tipo "OUTRO"), e o admin digita o valor creditado no banco para ver a diferença.

## O que muda

1. **Seção de conciliação no histórico (admin only)** -- linhas ~561-595 do `DepositosBrinks.tsx`:
   - Remover a conciliação vinculada a lote
   - Adicionar dois date pickers (data inicial e data final) usando Popover+Calendar
   - Query ao banco: buscar todos os depósitos Brinks do posto selecionado no período, excluindo registros com `tipo = 'OUTRO'`, somando os valores
   - Campo editável "Valor creditado no banco (R$)" com input numérico
   - Diferença calculada: Total Brinks - Valor creditado
   - Cores: verde (diferença = 0), amarelo (positivo), vermelho (negativo)

2. **A conciliação não precisa mais ser salva por lote na importação** -- linhas ~299-306:
   - Remover a inserção automática na tabela `conciliacao_brinks` ao salvar importação
   - A conciliação agora é uma ferramenta de consulta em tempo real (sem persistência obrigatória), ou opcionalmente salvar o resultado

3. **Manter a tabela `conciliacao_brinks` existente** mas ela pode ser usada opcionalmente para salvar registros de conferência por período. Alternativamente, a conciliação pode ser puramente calculada no frontend sem persistência.

## Detalhes Técnicos

- **Query por período**: `supabase.from('depositos_brinks').select('valor, tipo').eq('posto_id', postoId).gte('data_deposito', dataInicial).lte('data_deposito', dataFinal)` e filtrar `tipo !== 'OUTRO'` client-side ou com `.neq('tipo', 'OUTRO')`
- **Date pickers**: Usar componente Calendar com Popover (shadcn pattern) com `format(date, 'dd/MM/yyyy')` para exibição pt-BR
- **Estado**: `concDataInicial`, `concDataFinal`, `concTotalBrinks`, `concValorBanco`
- **Posição**: Card separado abaixo do histórico, visível apenas para `role === 'admin'`

## Arquivos a editar

- `src/pages/DepositosBrinks.tsx` -- refatorar seção de conciliação

