

# Corrigir Constraint Única na Tabela resumo_conferencia

## Problema

A tabela `resumo_conferencia` tem uma constraint única em `(posto_id, data, turno)`, mas agora que adicionamos `centro_custo`, podem existir múltiplas linhas com mesmo posto/data/turno mas centros de custo diferentes. Ao salvar, o insert falha com erro de chave duplicada.

## Solução

### 1. Migração SQL

- Remover a constraint antiga: `DROP CONSTRAINT resumo_conferencia_posto_id_data_turno_key`
- Criar nova constraint incluindo `centro_custo`: `UNIQUE (posto_id, data, turno, centro_custo)`

### 2. Atualizar `handleSaveRow` em `ResumoDiario.tsx`

O código já envia `centro_custo` no insert, então após a migração deve funcionar. Mas vou verificar se o match no `loadResumo` também está correto para vincular o `resumoId` considerando `centro_custo`.

