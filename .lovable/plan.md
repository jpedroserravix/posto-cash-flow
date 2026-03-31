

# Adicionar FilterableHead na Tela de Depósitos Manuais

## Resumo

Aplicar o mesmo sistema de filtros clicáveis (FilterableHead) que já existe na tela de Depósitos Brinks na tela de Depósitos Manuais, permitindo filtrar por Data, Turno, Centro de Custo e Observação.

## Mudanças em `src/pages/DepositosManuais.tsx`

### 1. Novos states e imports
- Importar `FilterableHead`, `useMemo`
- Adicionar states de ordenação: `sortCol`, `sortDir`
- Adicionar states de filtro por coluna: `filterData`, `filterTurno`, `filterCentroCusto`, `filterObservacao` (todos `Set<string>`)

### 2. Lógica de filtragem e ordenação (useMemo)
- Criar `filteredData` memo que:
  - Filtra pelos Sets ativos (exclui valores no Set)
  - Ordena pela coluna/direção selecionada
- Calcular `depositsWithSaldo` a partir do `filteredData` (não mais do `deposits` direto)

### 3. Valores únicos por coluna (useMemo)
- Extrair valores únicos de cada coluna filtrável dos dados completos (`deposits`)

### 4. Substituir TableHead por FilterableHead
- Trocar os `<TableHead>` de Data, Turno, Centro de Custo e Observação pelo componente `<FilterableHead>` com sort + filtro
- Manter Valor Lançado, Valor Depositado e Saldo Pendente como TableHead simples (sem filtro textual, apenas ordenável)

### 5. Botão "Limpar filtros"
- Exibir botão quando houver filtros ativos, resetando todos os Sets

