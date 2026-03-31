

# Conciliação Bancária com Seleção de Depósitos e Cadastro de Bancos

## Resumo

Substituir a conciliação atual (baseada em filtro de período) por um fluxo onde o admin seleciona depósitos individuais e os marca como "recebidos" em uma conta bancária cadastrada. Inclui também uma tela para cadastrar contas bancárias (banco, agência, conta).

## O que será criado

### 1. Tabela `contas_bancarias` (nova)
Armazena as contas bancárias do posto (ex: Banco Sicredi).

| Coluna | Tipo | Obs |
|--------|------|-----|
| id | uuid | PK |
| posto_id | uuid | FK postos |
| banco | text | Ex: "Sicredi" |
| agencia | text | Ex: "0123" |
| conta | text | Ex: "45678-9" |
| created_at | timestamptz | default now() |

RLS: admin full access, funcionario pode ver do próprio posto.

### 2. Coluna `conciliado_banco_id` na tabela `depositos_brinks` (nova coluna)
Quando o admin "recebe" um depósito, grava o ID da conta bancária nesse campo. Se NULL, o depósito ainda não foi conciliado.

### 3. Tela de Cadastro de Bancos
Nova página `/bancos` (admin only) ou seção dentro de Postos, com formulário para adicionar/listar contas bancárias (banco, agência, conta) vinculadas ao posto selecionado.

### 4. Conciliação reformulada (aba "Conciliação" em Depósitos Brinks)
- Lista depósitos **não conciliados** do posto com checkboxes para seleção
- Dropdown para escolher a conta bancária de destino
- Botão "Receber no banco" que marca os depósitos selecionados com o `conciliado_banco_id`
- Exibe total dos selecionados, campo para digitar valor do extrato, e diferença com cores

## Arquivos a editar/criar

- **Migration SQL**: criar tabela `contas_bancarias` + adicionar coluna `conciliado_banco_id` em `depositos_brinks`
- **`src/pages/ContasBancarias.tsx`** (novo): tela CRUD de contas bancárias (admin only)
- **`src/pages/DepositosBrinks.tsx`**: refatorar aba Conciliação com checkboxes e seletor de banco
- **`src/App.tsx`**: adicionar rota `/bancos`
- **`src/components/AppLayout.tsx`**: adicionar link "Bancos" no menu (admin only)

## Detalhes Técnicos

- Query conciliação: `depositos_brinks` where `posto_id = X` and `conciliado_banco_id IS NULL`, ordenado por `data_caixa`
- Ao "receber": `UPDATE depositos_brinks SET conciliado_banco_id = bancoId WHERE id IN (...)` 
- Histórico de conciliados: filtrar por `conciliado_banco_id IS NOT NULL` com agrupamento por banco

