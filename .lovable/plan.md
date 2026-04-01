

# Manter Depósitos Salvos em Verde Permanentemente

## Problema

Atualmente, quando um depósito é salvo, ele fica verde por 3 segundos e depois volta ao normal (linhas 580-586 removem o ID do `savedRows` após timeout).

## Solução

Remover o `setTimeout` que limpa o estado verde após 3 segundos (linhas 580-586). Assim, os depósitos salvos permanecem verdes durante toda a sessão.

### Arquivo: `src/pages/DepositosBrinks.tsx`

- **Remover linhas 580-586** — o `setTimeout` que deleta o `dep.id` do `savedRows` após 3s
- O `savedRows` continuará acumulando IDs salvos, mantendo o fundo verde permanentemente enquanto o usuário estiver na página

