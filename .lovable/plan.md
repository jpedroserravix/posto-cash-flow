

# Aumentar Campo de Data Caixa

## Problema

O campo `<Input type="date">` da coluna "Data Caixa" tem largura fixa de `w-32` (128px), que é pequeno demais para exibir a data completa e o ícone do calendário nativo do navegador.

## Solução

Aumentar a largura do campo de data em ambos os locais onde aparece:

### Mudanças em `src/pages/DepositosBrinks.tsx`

1. **Linha 565** (tabela de importação): trocar `w-32` por `w-40`
2. **Linha 753** (tabela principal): trocar `w-32` por `w-40`

Isso muda de 128px para 160px, dando espaço suficiente para a data e o ícone do calendário.

