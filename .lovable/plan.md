

# Adicionar Coluna "Centro de Custo" nas 3 Telas + Resumo

## Resumo

Adicionar o campo "Centro de Custo" (opções: Pista, Conveniência, Troca de Óleo) nas tabelas `depositos_brinks`, `depositos_manuais` e `resumo_conferencia`, e atualizar as 3 telas de UI + Resumo Diário para agrupar por centro de custo.

## 1. Migração de Banco de Dados

Adicionar coluna `centro_custo` (text, nullable, default null) nas 3 tabelas:

```sql
ALTER TABLE depositos_brinks ADD COLUMN centro_custo text;
ALTER TABLE depositos_manuais ADD COLUMN centro_custo text;
ALTER TABLE resumo_conferencia ADD COLUMN centro_custo text;
```

## 2. Depósitos Brinks (`src/pages/DepositosBrinks.tsx`)

- Adicionar `centro_custo` nas interfaces `BrinksRow` e `DepositoCompleto`
- Adicionar constante `CENTROS_CUSTO = ['PISTA', 'CONVENIÊNCIA', 'TROCA DE ÓLEO']`
- Na tabela principal: adicionar coluna com Select dropdown ao lado de Turno
- No `handleUpdateRow`: incluir `centro_custo` no update
- No `handleSave` (importação): incluir `centro_custo` no insert (default vazio)

## 3. Depósitos Manuais (`src/pages/DepositosManuais.tsx`)

- Adicionar `centro_custo` na interface `ManualDeposit`
- No formulário: adicionar Select de Centro de Custo (entre Turno e Valor)
- Incluir no `formData`, `handleSubmit`, `handleEdit`
- Na tabela: adicionar coluna Centro de Custo

## 4. Resumo Diário (`src/pages/ResumoDiario.tsx`)

- Alterar agrupamento: a chave passa de `data|turno` para `data|turno|centro_custo`
- Incluir `centro_custo` nos selects de brinks e manuais
- Adicionar coluna "Centro de Custo" na tabela
- No `handleSaveRow`: incluir `centro_custo` no insert/conferência
- Interface `ResumoRow`: adicionar campo `centroCusto`

