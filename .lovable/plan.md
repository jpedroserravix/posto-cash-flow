

# Tornar a Conciliação Bancária mais visível

## Problema

A seção de Conciliação Bancária existe no código (linha 572 do `DepositosBrinks.tsx`), renderizada para admins, mas fica escondida no final da página, abaixo da seção de importação e do histórico. O usuário precisa rolar muito para encontrá-la.

## Solução

Adicionar "Conciliação" como uma terceira opção no seletor de modo de visualização (que já tem "Importar" e "Histórico"), para que o admin possa acessar a conciliação bancária clicando em uma aba dedicada, sem precisar rolar a página.

## O que muda em `src/pages/DepositosBrinks.tsx`

1. **Adicionar modo "conciliacao" ao viewMode** -- o estado `viewMode` passa a aceitar `'import' | 'history' | 'conciliacao'`

2. **Adicionar botão "Conciliação" na barra de modos** (próximo aos botões "Importar Arquivo" e "Histórico"), visível apenas para `role === 'admin'`

3. **Mover o Card de Conciliação Bancária** para dentro de `{viewMode === 'conciliacao' && role === 'admin' && (...)}`, em vez de ficar sempre visível no final da página

4. **Sem mudanças na lógica** -- a funcionalidade de busca por período, soma de depósitos e cálculo de diferença permanece idêntica

