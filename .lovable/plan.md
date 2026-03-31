

# Corrigir Visibilidade do "Aplicar Centro de Custo"

## Problema

A barra com o "Aplicar Centro de Custo" só aparece quando **as 3 condições são verdadeiras**:
1. Usuário é admin
2. Há itens selecionados (checkbox)
3. **Existem contas bancárias cadastradas** (`contas.length > 0`)

Se não há contas bancárias, a barra inteira (incluindo o Centro de Custo em massa) fica invisível.

## Solução

Separar a lógica: a barra de conciliação bancária continua exigindo `contas.length > 0`, mas a seção de Centro de Custo em massa deve aparecer **sempre que houver itens selecionados** (para admin).

### Mudança em `src/pages/DepositosManuais.tsx`

Alterar a condição da linha 356 para remover `contas.length > 0` do requisito geral, e aplicar essa restrição apenas à parte de conciliação bancária (Select de conta + botão Conciliar). A seção de Centro de Custo ficará visível independentemente de haver contas cadastradas.

Concretamente: dividir o bloco em duas partes condicionais dentro do mesmo Card — a parte de conciliação bancária aparece só com contas, a parte de centro de custo aparece sempre com seleção.

