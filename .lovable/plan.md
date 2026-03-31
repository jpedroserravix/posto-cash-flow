

# Transformar Cabeçalhos da Tabela em Filtros Clicáveis

## Resumo

Ao clicar no cabeçalho "Data Depósito", "Depositante", "Turno", "Centro de Custo" etc., abrir um popover com as opções únicas daquela coluna para o usuário selecionar quais valores quer ver. O cabeçalho continua ordenável, mas agora também filtra.

## Mudanças em `src/pages/DepositosBrinks.tsx`

### 1. Criar componente `FilterableHead`

Substituir `SortableHead` por um componente mais completo que:
- Exibe o nome da coluna + ícone de ordenação + indicador de filtro ativo (badge com contagem)
- Ao clicar: alterna ordenação (comportamento atual)
- Ao clicar num ícone de filtro (ou botão dedicado): abre um `Popover` com checkboxes listando os valores únicos da coluna
- O usuário marca/desmarca quais valores quer visualizar
- Inclui botões "Selecionar todos" e "Limpar"

### 2. Novos states de filtro por coluna

Substituir os states individuais (`filterDepositante`, `filterTurno`) por um estado mais genérico ou adicionar novos:
- `filterDataDeposito: Set<string>` — datas únicas selecionadas
- `filterDepositante: Set<string>` — depositantes selecionados
- `filterTurno: Set<string>` — turnos selecionados
- `filterCentroCusto: Set<string>` — centros de custo selecionados
- `filterStatus: Set<string>` — status selecionados

Quando o Set está vazio, mostra tudo (sem filtro). Quando tem itens, mostra apenas os selecionados.

### 3. Atualizar `filteredData` memo

Aplicar cada filtro de Set: se `filterX.size > 0`, filtrar `data = data.filter(d => filterX.has(d.campo))`.

### 4. Atualizar área de filtros existente

Os filtros dropdown existentes (Status, Depositante, Turno) podem ser mantidos na área de filtros ou removidos, já que a funcionalidade agora estará nos cabeçalhos. O contador de filtros ativos e "Limpar filtros" continuam funcionando.

### 5. Imports necessários

Adicionar `Popover, PopoverContent, PopoverTrigger` e `Checkbox` (já importado).

## Resultado

Cada coluna da tabela terá um pequeno ícone de filtro. Ao clicar, aparece um popover com checkboxes dos valores disponíveis. O usuário seleciona apenas o que quer ver, similar ao filtro do Excel.

