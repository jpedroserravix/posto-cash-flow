

# Adicionar Filtros e Ordenação nos Cabeçalhos das Tabelas

## Resumo

Adicionar filtros clicáveis nos cabeçalhos das tabelas de Depósitos Brinks (Histórico e Conciliação), permitindo ordenar por coluna (Data Depósito, Valor, Tipo, etc.) e filtrar por texto/data.

## O que será implementado

### 1. Ordenação por coluna (sort)
- Clicar no cabeçalho alterna entre ascendente ↑, descendente ↓ e sem ordenação
- Ícone de seta no cabeçalho indica a direção atual
- Funciona nas tabelas do **Histórico** e da **Conciliação**
- Colunas ordenáveis: Data Depósito, Valor, Data Caixa, Tipo, Depositante

### 2. Filtros por texto
- Barra de busca acima da tabela do Histórico para filtrar por depositante, tipo ou observação
- Na Conciliação, filtro por depositante ou data caixa para encontrar depósitos específicos

### 3. Lógica client-side
- Toda a filtragem e ordenação é feita nos arrays `savedRows` e `concDepositos` já carregados em memória, sem novas queries ao banco
- Estado: `sortField`, `sortDir`, `filterText`

## Arquivo a editar

- `src/pages/DepositosBrinks.tsx`

## Mudanças específicas

1. **Novos estados**: `sortField`, `sortDirection` (para cada tabela), `filterText`
2. **Componente de cabeçalho clicável**: `TableHead` com `onClick` que alterna a ordenação e exibe ícone `ArrowUpDown` / `ArrowUp` / `ArrowDown` do lucide-react
3. **Lógica de sort/filter**: `useMemo` que aplica filtro de texto e ordenação sobre `savedRows` (histórico) e `concDepositos` (conciliação), gerando arrays derivados para renderização
4. **Campo de busca**: `Input` com ícone `Search` acima de cada tabela para filtrar por texto livre

