

# Plano: Refinamento Visual do App (sem alterar funcionalidades)

Quero deixar o app com uma aparência mais moderna, profissional e agradável — mantendo 100% das funcionalidades atuais. As mudanças são puramente estéticas.

## Antes de começar: corrigir erros de build

Existem erros TypeScript pré-existentes (não relacionados ao visual) que precisam ser corrigidos para o app compilar. São pequenos ajustes de tipagem em:
- `src/hooks/useAuth.tsx` (cast do retorno do query)
- `src/pages/DepositosManuais.tsx` (campos `comprovante_path/type` faltando no tipo)
- `src/pages/Usuarios.tsx` (cast do array)

Faço junto, rapidinho, antes do refinamento visual.

## 1. Paleta de cores mais sofisticada

Atualizar `src/index.css`:
- Trocar o azul básico (`220 70% 50%`) por um **indigo/azul-petróleo** mais elegante (`222 47% 31%` ou similar)
- Background com leve tonalidade quente (`210 20% 99%`) para reduzir cansaço visual
- Adicionar **modo escuro** completo (variáveis `.dark` no `:root`) — sem ativar por padrão, mas pronto
- Refinar tons de status: success/warning/destructive com saturação mais equilibrada
- Sidebar com gradiente sutil

## 2. Tipografia

- Manter Inter (já está boa) mas adicionar **font-feature-settings** para números tabulares (`tnum`) — essencial em app financeiro
- Ajustar hierarquia: títulos um pouco mais firmes, descrições com `tracking-tight`

## 3. Header e navegação (`AppLayout.tsx`)

- Header com **leve sombra** (`shadow-sm`) e backdrop-blur quando rolar
- Logo do posto com badge mais polido (gradiente sutil no quadradinho do `Fuel`)
- Botões da nav com **transição suave** no hover (background + scale leve)
- Tab ativa da nav secundária com **indicador animado** em vez do border-b estático
- Espaçamento mais respirável entre grupos

## 4. Cards e tabelas

- `Card`: sombra mais suave (`shadow-sm` em vez do default), border com opacidade reduzida, `rounded-xl` em vez de `rounded-lg`
- Tabelas: 
  - Header com background sutil (`bg-muted/30`)
  - Hover nas linhas com transição suave
  - Zebra stripe opcional muito sutil
  - Bordas mais finas

## 5. Badges de status

Padronizar via uma classe utilitária — manter as cores atuais (verde/amarelo/vermelho/cinza) mas com:
- `rounded-full` em vez de `rounded-md`
- Padding mais equilibrado
- Pequeno dot colorido antes do texto (estilo "status pill")

## 6. Botões

- Hover com **micro-animação** (subtle scale ou brightness)
- Botão primário com leve gradiente
- Loading states com spinner consistente

## 7. Inputs e formulários

- Focus ring mais elegante (anel mais fino com cor primária)
- Selects e inputs com transição no border ao focar
- Labels com peso 500

## 8. Página Dashboard (`Dashboard.tsx`)

- Cards de KPI com ícone em **círculo colorido suave** (bg com opacidade 10%)
- Números grandes com tabular-nums
- Pequenos sparklines/indicadores de tendência (se já houver dados — só visual, sem nova lógica)

## 9. Empty states e loading

- Skeleton loaders nos lugares que hoje mostram "Carregando..." em texto
- Empty states com ícone + texto centralizados, mais convidativos

## 10. Detalhes finais

- Scrollbar customizada (fina, na cor do tema)
- Toast com posição e estilo refinados
- Animações de entrada suaves em modais (já vem do shadcn, só ajustar timing)
- Focus visible consistente para acessibilidade

## Arquivos editados

| Arquivo | Mudança |
|---------|---------|
| `src/index.css` | Paleta refinada, dark mode, tipografia, scrollbar |
| `tailwind.config.ts` | Novos tokens (animation, shadow customizada) |
| `src/components/AppLayout.tsx` | Header, nav, tab indicator |
| `src/components/ui/card.tsx` | Sombra/borda mais suave |
| `src/components/ui/badge.tsx` | Variante status pill com dot |
| `src/components/ui/button.tsx` | Micro-animações, gradiente sutil |
| `src/pages/Dashboard.tsx` | KPIs polidos |
| `src/hooks/useAuth.tsx` + 2 outros | Fix dos erros de build |

**Nenhuma funcionalidade muda.** Apenas CSS, tokens de design e pequenos refinos de markup visual.

