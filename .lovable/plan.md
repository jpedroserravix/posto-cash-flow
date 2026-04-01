

# Adicionar Opção em Branco no Centro de Custo + Excluir do Resumo Diário

## Resumo

Adicionar uma opção em branco ("Sem centro de custo") nos selects de centro de custo em Depósitos Brinks e Depósitos Manuais. Depósitos com centro de custo em branco/null serão ignorados no Resumo Diário.

## Mudanças

### 1. `src/pages/DepositosBrinks.tsx`

- **Default de importação**: mudar `centro_custo: 'PISTA'` de volta para `centro_custo: ''` nas 3 funções de parsing (linhas 84, 128, 180)
- **Select de centro de custo** (linhas 650-653 e 850-853): adicionar um `SelectItem` com valor vazio `""` e label "(Em branco)" antes das opções existentes
- Ao salvar, `centro_custo: '' || null` já envia null para o banco (linha 524 e 573 já fazem isso)

### 2. `src/pages/DepositosManuais.tsx`

- **Select de centro de custo** no formulário (linha 328-331) e no bulk (linha 382-385): adicionar `SelectItem` com valor vazio e label "(Em branco)"

### 3. `src/pages/ResumoDiario.tsx`

- **Filtrar depósitos sem centro de custo**: nas iterações de `brinks` (linha ~60) e `manuais` (linha ~68), pular registros onde `centro_custo` é null/vazio
- Adicionar condição: `if (!b.centro_custo) return;` e `if (!m.centro_custo) return;`

