

# Agrupar Turnos por Data + Centro de Custo no Resumo Diário

## Resumo

Entendi perfeitamente. Cada "caixa" do dia é formado pelos 3 turnos de um centro de custo. A tela vai agrupar visualmente os turnos em cards por data + centro de custo, com a soma total do grupo e um único botão de conferência (OK / PENDENTE / DIVERGENCIA) para o grupo inteiro.

```text
┌─────────────────────────────────────────────────────┐
│ 30/03/2026 — Pista                     Total: R$ X  │
│ ┌──────┬──────────┬─────────┬─────────┐             │
│ │Turno │Cofre Brinks│ Manual │ Total  │             │
│ │  1   │  R$ 100  │ R$ 50  │ R$ 150 │             │
│ │  2   │  R$ 200  │ R$ 80  │ R$ 280 │             │
│ │  3   │  R$ 150  │ R$ 60  │ R$ 210 │             │
│ └──────┴──────────┴─────────┴─────────┘             │
│ Soma: R$ 640    [Conferido: ▼ OK]  [Obs: ___] [💾] │
└─────────────────────────────────────────────────────┘
```

## Mudanças

### 1. Modelo de dados — `resumo_conferencia` muda de granularidade

Atualmente salva por `(posto_id, data, turno, centro_custo)`. A conferência agora é por **grupo** `(posto_id, data, centro_custo)`, sem turno individual.

- **Migração SQL**: Remover a constraint atual, criar nova `UNIQUE (posto_id, data, centro_custo)`. Remover a obrigatoriedade da coluna `turno` (tornar nullable) e ao salvar um grupo, gravar com `turno = NULL` (indicando que é conferência do grupo).

### 2. Reestruturar `ResumoDiario.tsx`

- **Agrupar rows**: Após carregar os dados individuais por turno, agrupar em `Map<string, ResumoRow[]>` com chave `data|centroCusto`.
- **Renderização**: Em vez de uma tabela plana, iterar sobre os grupos. Cada grupo é um `Card` com:
  - Cabeçalho: Data + Centro de Custo + Soma total do grupo
  - Mini-tabela interna com os turnos (somente leitura: Turno, Cofre Brinks, Manual, Total)
  - Rodapé do card: linha de soma + Select de Conferido + Input de Observação + botão Salvar
- **handleSaveGroup**: Salva/atualiza um registro em `resumo_conferencia` com `turno = NULL` para o grupo `(data, centro_custo)`.
- **Ordenação**: Groups ordenados por data decrescente, depois centro de custo alfabético.

### 3. Detalhes visuais

- Cards com borda colorida baseada no status: verde (OK), amarelo (PENDENTE), vermelho (DIVERGENCIA)
- Soma em destaque (negrito, fonte maior)
- Se um centro de custo tiver menos de 3 turnos, exibe apenas os existentes

