

# Melhorar Rolagem Horizontal nas Tabelas

## Problema

As tabelas de Depósitos Brinks e Depósitos Manuais são largas e a única barra de rolagem horizontal fica no final da tabela, forçando o usuário a descer até o final para conseguir rolar para o lado.

## Solução

Usar uma barra de rolagem horizontal **fixa no rodapé da tela** (sticky bottom) para que ela fique sempre visível, independente da posição vertical do scroll.

### Mudanças

**1. `src/pages/DepositosBrinks.tsx`**
- Envolver a tabela principal em um container com `overflow-x-auto` e uma classe customizada que fixa a scrollbar no bottom da viewport
- Usar CSS `position: sticky; bottom: 0` no container de scroll via uma classe utilitária

**2. `src/pages/DepositosManuais.tsx`**
- Mesma abordagem: container com scrollbar sticky no bottom

**3. `src/index.css`**
- Adicionar uma classe CSS customizada (ex: `.sticky-scrollbar`) que usa a pseudo-classe `::-webkit-scrollbar` e `overflow-x: auto` com `position: sticky; bottom: 0` — ou alternativamente, aplicar `max-height` com `overflow: auto` no wrapper para que a scrollbar horizontal fique sempre visível na viewport

A abordagem mais simples e cross-browser: definir um `max-height` no container da tabela (ex: `calc(100vh - 200px)`) com `overflow: auto`, criando um scroll box contido onde **ambas** as barras (vertical e horizontal) ficam visíveis na tela sem precisar descer.

