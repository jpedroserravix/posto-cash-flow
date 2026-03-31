

# Evitar Duplicação ao Importar Depósitos Brinks

## Problema

Ao importar depósitos, o sistema insere todos os registros do arquivo sem verificar se já existem no banco. Isso gera duplicatas.

## Solução

Antes de inserir, comparar cada linha importada com os depósitos já existentes no banco (para o mesmo posto). Um depósito é considerado duplicado quando tem mesma `data_deposito`, `valor` e `depositante`. Apenas os novos são inseridos.

## Mudanças em `src/pages/DepositosBrinks.tsx`

Na função `handleSave` (linha ~463):

1. Buscar depósitos existentes do posto: `supabase.from('depositos_brinks').select('data_deposito, valor, depositante').eq('posto_id', selectedPostoId)`
2. Criar um `Set` de chaves dos existentes: `"data_deposito|valor|depositante"`
3. Filtrar `inserts` removendo os que já têm chave no Set
4. Se todos forem duplicados, exibir toast informando "Todos os depósitos já existem"
5. Se alguns forem novos, inserir apenas esses e informar quantos foram salvos e quantos ignorados

