

# Corrigir Duplicação na Importação Brinks

## Problema

A detecção de duplicatas na função `handleFile` (linha 430-436) compara a `data_deposito` do arquivo importado com a do banco de dados usando `rowKey()`, que concatena os valores brutos. Porém:

- **Arquivo importado**: data vem formatada como `"DD/MM/YYYY HH:MM:SS"` (ex: `"15/03/2026 10:30:00"`)
- **Banco de dados**: data vem como ISO timestamp (ex: `"2026-03-15T10:30:00+00:00"`)

Como os formatos são diferentes, `rowKey()` nunca encontra match, e **todos os registros são considerados novos**, gerando duplicatas a cada importação.

## Solução

Normalizar o campo `data_deposito` antes de comparar. Converter ambos os lados (dados do banco e dados importados) para um formato comum antes de gerar a chave de comparação.

### Mudanças em `src/pages/DepositosBrinks.tsx`

1. **Criar função `normalizeDate`** que converte qualquer formato de data para `YYYY-MM-DD HH:MM:SS` (canônico para comparação)

2. **Alterar `rowKey`** para usar `normalizeDate` no campo `data_deposito`, garantindo que tanto o dado do banco quanto o do arquivo resultem na mesma chave

3. **Na função `handleFile`**, aplicar `normalizeDate` tanto nos registros existentes (`existing`) quanto nos registros parseados (`parsed`) ao gerar as chaves de comparação

Concretamente:
```
function normalizeDate(d: string): string {
  // Tenta parse ISO (banco) e DD/MM/YYYY (arquivo)
  // Retorna YYYY-MM-DD HH:MM:SS
}
```

E no `rowKey`:
```
function rowKey(r) {
  return `${normalizeDate(r.data_deposito)}|${r.valor}|${r.depositante}|${r.tipo}`;
}
```

Isso garante que `"15/03/2026 10:30:00"` e `"2026-03-15T10:30:00+00:00"` gerem a mesma chave, eliminando as duplicatas.

