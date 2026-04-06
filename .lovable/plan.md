

# Corrigir Sincronização Brinks ↔ Extrato + Auto-seleção de Conta

## Mudanças

### 1. `src/pages/DepositosBrinks.tsx` — `handleDesconciliar` (linha ~396)

Após zerar `conciliado_banco_id` dos depósitos (linha 403), adicionar:
- Buscar em `extrato_bancario` lançamentos que contenham qualquer dos IDs desconciliados no array `deposito_brinks_ids` (usando `.contains()` para cada ID, ou query direta)
- Como Supabase não suporta "array contains any of" facilmente, buscar todos os lançamentos do posto e filtrar no client, ou fazer N queries com `.contains([id])`
- Para cada lançamento encontrado: `update({ conciliado: false, deposito_brinks_ids: null })`

### 2. `src/pages/DepositosBrinks.tsx` — `handleReceberBanco` (linha ~414)

Após salvar `conciliado_banco_id` (linha 421), adicionar:
- Calcular soma dos depósitos selecionados a partir do estado local
- Buscar em `extrato_bancario` lançamento com `conta_bancaria_id = concBancoId`, `posto_id = selectedPostoId`, `valor = somaCalculada`, memo contendo "CREDITO COFRE INTELIGENTE", e `conciliado = false`
- Se encontrar match: `update({ conciliado: true, deposito_brinks_ids: ids })`

### 3. `src/pages/ExtratoBancario.tsx` — Auto-seleção de conta (linha ~76-84)

No `loadContas`, após receber os dados, se `selectedContaId` está vazio e há contas disponíveis, chamar `setSelectedContaId(data[0].id)` automaticamente. Isso faz o `loadExtrato` disparar via useEffect existente.

## Arquivos editados

| Arquivo | Mudança |
|---------|---------|
| `src/pages/DepositosBrinks.tsx` | Sincronizar extrato em `handleDesconciliar` e `handleReceberBanco` |
| `src/pages/ExtratoBancario.tsx` | Auto-selecionar primeira conta ao carregar |

