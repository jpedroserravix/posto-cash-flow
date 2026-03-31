

# Aplicar Centro de Custo em Massa nos Depósitos Manuais

## Resumo

Adicionar na barra de conciliação (que aparece quando há itens selecionados) um seletor de Centro de Custo com um botão "Aplicar", permitindo definir o centro de custo para todos os depósitos selecionados de uma vez.

## Como vai funcionar

1. Quando houver itens selecionados via checkbox, além das opções de conciliação já existentes, aparece um **Select de Centro de Custo** + botão **"Aplicar Centro de Custo"**
2. Ao clicar, faz `UPDATE` em todos os IDs selecionados com o centro de custo escolhido
3. Recarrega os dados e limpa a seleção

## Mudanças em `src/pages/DepositosManuais.tsx`

1. **Novo estado** `bulkCentroCusto` para o valor selecionado no select de aplicação em massa
2. **Nova função** `handleBulkCentroCusto` — faz `supabase.from('depositos_manuais').update({ centro_custo }).in('id', [...concSelected])`
3. **Na barra de conciliação** (linhas 338-363) — adicionar uma seção com o Select de `CENTROS_CUSTO` e o botão "Aplicar Centro de Custo", separada visualmente da parte de conciliação bancária por um `Separator`

