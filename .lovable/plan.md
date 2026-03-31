

# Unificar Histórico e Conciliação + Filtros Avançados

## Resumo

Eliminar a separação entre "Histórico" e "Conciliação". Tudo fica em uma única tabela com checkboxes para selecionar depósitos e conciliar. Os filtros passam a ter dropdowns para escolher valores específicos (ex: selecionar um depositante específico, um tipo específico), além da ordenação já existente.

## O que muda

### 1. Remover abas separadas
- Eliminar o `viewMode` de `'history' | 'conciliacao'` — só manter `'import'` vs a tela principal
- Remover botões "Histórico" e "Conciliação" da barra de ações
- A tela principal mostra **todos os depósitos do posto** (não mais por lote), com uma coluna indicando status (conciliado ou pendente)

### 2. Tabela unificada com checkboxes
- Todos os depósitos aparecem na mesma tabela, com checkbox na primeira coluna (admin only)
- Depósitos já conciliados ficam com visual diferente (ex: fundo verde claro, ícone de check)
- Filtro rápido para mostrar: "Todos", "Pendentes", "Conciliados"
- Seletor de conta bancária + botão "Receber no banco" ficam no rodapé da tabela, junto com total selecionado e campo de valor do extrato

### 3. Filtros avançados por valor específico
Substituir o campo de texto livre por filtros dropdown para cada coluna:
- **Depositante**: dropdown com valores únicos encontrados nos dados
- **Tipo**: dropdown com valores únicos
- **Turno**: dropdown com os turnos existentes
- **Status**: Todos / Pendentes / Conciliados
- Manter a busca por texto como opção adicional
- Manter a ordenação clicável nos cabeçalhos

### 4. Carregar todos os depósitos do posto
- Em vez de carregar por lote, carregar todos os depósitos do posto selecionado (com paginação se necessário)
- Incluir coluna `conciliado_banco_id` no select para saber o status

## Arquivo a editar

- `src/pages/DepositosBrinks.tsx` — refatoração da seção de visualização

## Mudanças técnicas

1. **Query única**: `SELECT * FROM depositos_brinks WHERE posto_id = X ORDER BY data_deposito DESC` (sem filtro por lote)
2. **Estados de filtro**: `filterDepositante`, `filterTipo`, `filterTurno`, `filterStatus` (cada um string ou `'all'`)
3. **Dropdowns de filtro**: Extrair valores únicos dos dados com `[...new Set(data.map(d => d.depositante))]`
4. **Checkbox + conciliação**: Mesmo fluxo atual de `concSelected`, `handleReceberBanco`, mas integrado na tabela única
5. **Indicador visual**: Coluna "Status" mostrando "Pendente" / "Conciliado" com badge colorido

