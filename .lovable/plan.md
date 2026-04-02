

# Tela de Extrato Bancário com Conciliação Automática Bidirecional

## Resumo

Criar página "Extrato Bancário" com importação de OFX Sicredi, conciliação automática com depósitos Brinks (marcando ambos os lados), e navegação restrita a admin.

## 1. Migration SQL

```sql
CREATE TABLE public.extrato_bancario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES postos(id),
  conta_bancaria_id uuid NOT NULL REFERENCES contas_bancarias(id),
  fitid text NOT NULL,
  data_lancamento date NOT NULL,
  valor numeric NOT NULL,
  memo text,
  tipo text,
  conciliado boolean NOT NULL DEFAULT false,
  deposito_brinks_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conta_bancaria_id, fitid)
);

ALTER TABLE public.extrato_bancario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all extrato" ON public.extrato_bancario
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can manage own posto extrato" ON public.extrato_bancario
  FOR ALL TO authenticated
  USING (posto_id = get_user_posto_id(auth.uid()))
  WITH CHECK (posto_id = get_user_posto_id(auth.uid()));
```

## 2. Nova página `src/pages/ExtratoBancario.tsx`

Seguindo padrões visuais de `DepositosBrinks.tsx`:

- **Seletor de conta bancária** do posto selecionado
- **Botão "Importar OFX"** com input file hidden
- **Parser OFX**: extrair blocos `<STMTTRN>`, converter `DTPOSTED` (`20260323000000[-3:GMT]` → `2026-03-23`), extrair `TRNAMT`, `FITID`, `MEMO`, `TRNTYPE`
- **Deduplicação**: skip inserts onde `fitid` já existe para a conta
- **Filtro por status**: Todos / Conciliado / Pendente
- **Tabela**: Data, Valor (BRL), Memo, Tipo, Status (Badge)
- **Rodapé**: total créditos e débitos
- **Linhas conciliadas**: `bg-green-50` permanente

### Conciliação automática bidirecional (no import)

Para cada lançamento OFX com MEMO contendo "CREDITO COFRE INTELIGENTE":

1. Buscar em `depositos_brinks` do mesmo `posto_id` onde `conciliado_banco_id IS NULL` e cuja soma de `valor` = `TRNAMT` do OFX
2. Se match encontrado:
   - Marcar `extrato_bancario.conciliado = true` e salvar IDs em `deposito_brinks_ids`
   - **Atualizar `depositos_brinks.conciliado_banco_id = conta_bancaria_id`** para cada depósito do match

Isso garante que os depósitos Brinks também ficam marcados como conciliados na tela de Depósitos Brinks.

## 3. Roteamento e Navegação

- **`src/App.tsx`**: nova rota `/extrato` → `<ProtectedRoute><ExtratoBancario /></ProtectedRoute>`
- **`src/components/AppLayout.tsx`**: adicionar `{ to: '/extrato', label: 'Extrato Bancário', icon: Receipt }` no array `adminItems`

## Arquivos

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar tabela com RLS |
| `src/pages/ExtratoBancario.tsx` | Criar página completa |
| `src/App.tsx` | Adicionar rota |
| `src/components/AppLayout.tsx` | Adicionar menu |

