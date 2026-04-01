

# Corrigir Exibição de Horários nos Depósitos Brinks

## Problema

Os horários aparecem deslocados (geralmente 3h a menos) porque:
1. O arquivo Brinks traz horários locais (ex: `19:47:59`)
2. `parseDateBR` converte para `"2026-03-31T19:47:59"` sem timezone
3. Postgres interpreta como UTC e armazena `19:47:59+00:00`
4. Na exibição, `new Date("...+00:00").toLocaleString('pt-BR')` converte UTC → horário local, mostrando `16:47:59` (3h a menos)

## Solução

Corrigir a **exibição** e a **importação futura** para evitar deslocamento de timezone.

### Mudanças em `src/pages/DepositosBrinks.tsx`

1. **Criar função `formatDateDirect`** — extrai data/hora diretamente da string ISO sem usar `new Date()`, evitando conversão de timezone:
   ```
   "2026-03-31T19:47:59+00:00" → "31/03/2026 19:47:59"
   ```

2. **Substituir `new Date(dep.data_deposito).toLocaleString('pt-BR')`** (linha 814) pela nova função

3. **Substituir `new Date(d.data_deposito).toLocaleDateString('pt-BR')`** nos filtros (linhas 282 e 305) para usar a mesma lógica sem `new Date()`

4. **Corrigir `parseDateBR`** (linha 477) — para importações futuras, não mudar nada na conversão de data pois os valores já estão sendo armazenados corretamente como strings ISO

