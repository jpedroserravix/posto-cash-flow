

# Somar Valores dos Itens Selecionados na Barra de Conciliação

## Problema

Ao selecionar depósitos para conciliar, a barra mostra apenas a quantidade de itens selecionados, mas não mostra a soma dos valores (lançado e depositado), dificultando a conferência.

## Solução

Na barra de conciliação (linhas 338-356), calcular e exibir a soma de `valor_lancado` e `valor_depositado` dos itens selecionados.

### Mudanças em `src/pages/DepositosManuais.tsx`

1. **Calcular somas dos selecionados** — Adicionar um `useMemo` que filtra `deposits` pelos IDs em `concSelected` e soma `valor_lancado` e `valor_depositado`.

2. **Exibir na barra de conciliação** — Ao lado do texto "{N} selecionado(s)", mostrar:
   - `Valor Lançado: R$ X.XXX,XX`
   - `Valor Depositado: R$ X.XXX,XX`
   
   Formatados com `formatCurrency`, em badges ou spans destacados para fácil leitura.

