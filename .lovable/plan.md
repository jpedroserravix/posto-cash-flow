

# Importação de Relatório PDF Quality + Integração com Resumo Diário

## 1. Migration SQL

Criar tabela `relatorio_quality` com as colunas especificadas, RLS com as mesmas políticas padrão (admin full + users own posto).

```sql
CREATE TABLE public.relatorio_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL,
  data_caixa date NOT NULL,
  total_dinheiro_apurado numeric,
  total_cartao numeric,
  total_pix numeric,
  total_vendas numeric,
  total_despesas numeric,
  diferenca_caixa numeric,
  raw_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (posto_id, data_caixa)
);
ALTER TABLE public.relatorio_quality ENABLE ROW LEVEL SECURITY;
-- RLS admin + user posto (mesmas das outras tabelas)
```

## 2. Parser PDF Quality

Usar `pdfjs-dist` (já disponível no ecossistema Vite) para extrair texto do PDF no browser. Criar função `parseQualityPDF(text: string)` que usa regex para extrair:

- `data_caixa`: regex em "Caixa: DD/MM/YYYY"
- `total_dinheiro_apurado`: linha "Dinheiro" → coluna "Apurado"
- `total_cartao`: "Subtotal" da seção "Tipo: POS"
- `total_pix`: "GETNET PIX" na seção POS
- `total_vendas`: "Total Geral" seção financeiro
- `total_despesas`: "Subtotal" da seção "Tipo: Despesa"
- `diferenca_caixa`: "Total" → coluna "Diferença"

**Nota**: O parser precisará de um PDF de exemplo real para calibrar os regex. Farei um parser baseado na estrutura descrita e poderá ser ajustado depois.

## 3. Mudanças em `src/pages/ResumoDiario.tsx`

### Botão de importação
- Adicionar botão "Importar Quality" no topo, ao lado do título
- Input file hidden que aceita `.pdf`
- Ao selecionar arquivo: extrair texto com pdfjs-dist → parsear → upsert na tabela `relatorio_quality`

### Carregar dados Quality
- No `loadResumo`, buscar também `relatorio_quality` do posto
- Criar mapa `qualityMap: Map<string, QualityData>` por data

### Interface GroupData expandida
- Adicionar campo opcional `quality?: QualityData` em cada grupo

### Painel colapsável por card
- Usar `Collapsible` do shadcn para seção "Conferência Quality"
- Se existir quality para a data: tabela comparativa com colunas Campo / Brinks+Manual / Quality / Diferença
- Linha "Dinheiro": soma do sistema vs `total_dinheiro_apurado`, delta colorido (verde=0, vermelho≠0)
- Linhas informativas: Cartão/PIX, Despesas, Diferença caixa (sem comparação direta, apenas exibição)
- Se não existir: badge cinza "Sem relatório Quality"

## 4. Instalação

- Instalar `pdfjs-dist` como dependência

## Arquivos

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar tabela + RLS |
| `package.json` | Adicionar `pdfjs-dist` |
| `src/pages/ResumoDiario.tsx` | Botão importar, parser, painel comparativo |

