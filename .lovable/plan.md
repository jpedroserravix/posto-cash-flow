

# Permitir Depósito Manual com Valor Lançado Zero

## Problema

Na linha 57 de `DepositosManuais.tsx`, a validação `if (!valorLancado)` bloqueia o valor zero porque em JavaScript `!0` é `true`. Isso impede lançamentos com valor R$ 0,00.

## Solução

Alterar a validação para checar apenas se o campo está vazio ou se não é um número válido, em vez de tratar zero como inválido.

### Mudança em `src/pages/DepositosManuais.tsx`

**Linha 56-57** — trocar:
```typescript
const valorLancado = parseMoney(formData.valor_lancado);
if (!valorLancado) { toast.error('Informe o valor lançado'); return; }
```
por:
```typescript
const valorLancado = parseMoney(formData.valor_lancado);
if (valorLancado === null) { toast.error('Informe o valor lançado'); return; }
```

Também ajustar `parseMoney` (linha 47-49) para retornar `null` quando a string está vazia e `0` quando o valor é zero:
```typescript
const parseMoney = (v: string) => {
  if (!v.trim()) return null;
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
```

