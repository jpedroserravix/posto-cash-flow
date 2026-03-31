

# Desconciliar Depósitos + Barra de Seleção Fixa

## Resumo

Duas melhorias: (1) permitir desfazer conciliação de depósitos já conciliados, e (2) mover o resumo de seleção/conciliação para uma barra fixa (sticky) no topo ou rodapé da tela, sempre visível ao rolar.

## O que muda

### 1. Desconciliar depósitos
- Na coluna de checkbox, depósitos conciliados passam a ter checkbox também (em vez de apenas o ícone de check)
- Ao selecionar depósitos conciliados, aparece botão "Desconciliar" que faz `UPDATE depositos_brinks SET conciliado_banco_id = NULL WHERE id IN (...)`
- Separar visualmente: "X pendentes selecionados" e "Y conciliados selecionados"

### 2. Barra de seleção fixa (sticky)
- Quando há depósitos selecionados, exibir uma barra fixa no rodapé da tela (`fixed bottom-0`) com:
  - Quantidade e total selecionado
  - Seletor de conta bancária + campo valor banco + botões "Receber" / "Desconciliar"
- Remove a seção de conciliação do final da tabela (que fica escondida ao rolar)

## Arquivo a editar

- `src/pages/DepositosBrinks.tsx`

## Mudanças técnicas

1. **Checkbox em conciliados**: remover a condição `!isConciliado` que mostra apenas ícone; mostrar checkbox para todos, com indicador visual de que já está conciliado
2. **Separar seleção**: calcular `selectedPendentes` e `selectedConciliados` a partir de `concSelected`
3. **Botão desconciliar**: `supabase.from('depositos_brinks').update({ conciliado_banco_id: null }).in('id', ids)`
4. **Barra sticky**: `div` com `fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg p-3` que aparece condicionalmente quando `concSelected.size > 0`

