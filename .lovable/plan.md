

# Indicador Visual de Salvamento Individual nos Depósitos

## Resumo

Quando o usuário clicar no botão de salvar (ícone Save) de uma linha individual, a linha receberá um destaque visual temporário: ícone de check verde + fundo verde claro por alguns segundos.

## Mudanças em `src/pages/DepositosBrinks.tsx`

### 1. Novo state para linhas salvas
- Adicionar `const [savedRows, setSavedRows] = useState<Set<string>>(new Set())` para rastrear quais linhas acabaram de ser salvas

### 2. Atualizar `handleUpdateRow` (linha 539)
- Após salvar com sucesso, adicionar o `dep.id` ao `savedRows`
- Usar `setTimeout` de 3 segundos para remover o ID do set, fazendo o indicador desaparecer automaticamente

### 3. Alterar a renderização da linha na tabela (linha 758)
- Adicionar condição: se `savedRows.has(dep.id)`, aplicar classe `bg-green-100 dark:bg-green-900/30 transition-colors`
- No botão Save (linha 807-809): quando `savedRows.has(dep.id)`, trocar o ícone `Save` por `Check` com cor verde (`text-green-600`)

### 4. Importar `Check` do lucide-react

Resultado: ao salvar, a linha pisca em verde com ícone de confirmação por 3 segundos, depois volta ao normal.

