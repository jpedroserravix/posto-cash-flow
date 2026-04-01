

# Centro de Custo Padrão "PISTA" nos Depósitos Brinks

## Resumo

Definir "PISTA" como valor default para o campo `centro_custo` em todos os pontos onde registros são criados (importação de arquivo e parsing). O usuário poderá alterar individualmente quando necessário.

## Mudanças em `src/pages/DepositosBrinks.tsx`

1. **Parsing de arquivos** — nas 3 funções de parsing (`parseTSV`, `parseHTML`, `parseXLS`), trocar `centro_custo: ''` por `centro_custo: 'PISTA'`
   - Linha 84: `parseTSV`
   - Linha 128: `parseHTML` (ou equivalente)
   - Linha 180: `parseXLS` (ou equivalente)

2. **Estado default de novas linhas manuais** (se houver) — mesmo tratamento

Isso garante que ao importar qualquer arquivo Brinks, todos os registros já vêm com "PISTA" preenchido. Se o posto tiver outro centro de custo, o usuário altera individualmente no select da tabela.

