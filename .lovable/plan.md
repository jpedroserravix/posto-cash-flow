

# Remover Colunas "Moeda" e "Tipo" da Tela de Depósitos Brinks

## Resumo

Remover as colunas "Moeda" e "Tipo" de todas as tabelas e filtros na página de Depósitos Brinks. Os campos continuam sendo importados e salvos no banco, mas não são exibidos na interface.

## Arquivo: `src/pages/DepositosBrinks.tsx`

### Mudanças

1. **Tabela de importação (preview)**: remover `<TableHead>Moeda</TableHead>`, `<TableHead>Tipo</TableHead>` e as `<TableCell>` correspondentes (`row.moeda`, `row.tipo`)

2. **Filtros dropdown**: remover o bloco do filtro "Tipo" (`filterTipo` Select) e o `uniqueTipos` memo. Remover o state `filterTipo` e sua lógica de filtragem

3. **Tabela principal**: remover `<SortableHead label="Moeda" .../>`, `<SortableHead label="Tipo" .../>` e as `<TableCell>` de `dep.moeda` e `dep.tipo`

4. **Busca textual**: remover `r.tipo` e `r.moeda` do filtro de texto livre

Os dados continuam sendo importados do arquivo e salvos no banco normalmente — apenas a exibição na UI é removida.

