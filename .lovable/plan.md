

# Limpar Duplicados e Corrigir Detecção

## Etapa 1 — Deletar duplicados existentes no banco

Usar uma query SQL para manter apenas 1 registro por combinação `(data_deposito, valor, depositante, tipo, posto_id)`, deletando os que têm ID duplicado (mantendo o mais antigo por `created_at`).

```sql
DELETE FROM depositos_brinks
WHERE id NOT IN (
  SELECT DISTINCT ON (data_deposito, valor, depositante, tipo, posto_id)
    id
  FROM depositos_brinks
  ORDER BY data_deposito, valor, depositante, tipo, posto_id, created_at ASC
);
```

## Etapa 2 — Corrigir `normalizeDate` no código

**Causa raiz**: O arquivo gera datas como `"2026-03-31T08:20:39"` (sem timezone). O `new Date()` do JavaScript interpreta isso como horário **local**. Já o banco retorna `"2026-03-31T08:20:39+00:00"` que é interpretado como **UTC**. Resultado: a mesma data gera strings diferentes.

**Correção**: Em vez de usar `new Date()` e `toISOString()`, extrair diretamente a parte `YYYY-MM-DD HH:MM:SS` da string com regex/split, sem passar pelo objeto Date. Isso evita qualquer problema de timezone.

```typescript
function normalizeDate(d: string): string {
  if (!d) return '';
  // Remove timezone suffix and T separator, extract raw datetime
  const cleaned = d.replace(/[T]/, ' ').replace(/([+-]\d{2}:\d{2}|Z)$/, '').split('.')[0].trim();
  // If BR format DD/MM/YYYY, convert to YYYY-MM-DD
  if (cleaned.includes('/')) {
    const [datePart, timePart] = cleaned.split(' ');
    const [day, month, year] = datePart.split('/');
    return `${year}-${month}-${day} ${timePart || '00:00:00'}`;
  }
  return cleaned;
}
```

### Arquivo alterado
- `src/pages/DepositosBrinks.tsx` — função `normalizeDate`

