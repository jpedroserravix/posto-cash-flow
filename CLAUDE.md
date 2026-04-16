# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Princípios de Desenvolvimento (seguir SEMPRE)

1. **REUTILIZAÇÃO PRIMEIRO:** Antes de criar componente novo, verificar e reutilizar os existentes (tabelas, modais, preview de arquivos, filtros, paginação, badges de status, formulários do Envio Rápido, botões de copiar). Se um padrão já existe, use-o.

2. **ARQUITETURA DESACOPLADA:** Cada módulo funciona independentemente. Erros em uma parte não afetam as outras.

3. **CONSISTÊNCIA VISUAL:** Seguir padrão existente de cores, espaçamentos, tipografia. Status: verde (OK), amarelo (pendente), vermelho (problema), cinza (cancelado).

4. **QUALIDADE DE CÓDIGO:** Componentes pequenos e focados, tipagem TypeScript correta, tratamento de erros com toast, queries Supabase eficientes, sem código duplicado.

5. **BANCO DE DADOS:** Mesmo padrão de RLS das tabelas existentes, sempre created_at/updated_at, foreign keys com ON DELETE, constraints CHECK para enums.

6. **STORAGE:** Reutilizar buckets existentes quando possível, criar novo só quando fizer sentido, sempre incluir RLS.

7. **PERMISSÕES:** Toda nova tela precisa de entrada em permissions.ts, atualizar perfis padrão, gerar SQL para atualizar usuários existentes.

8. **ANTES DE TERMINAR:** Rodar build check, não quebrar funcionalidades existentes, documentar padrões novos neste CLAUDE.md.

9. **SQL:** Gerar SQL completo e organizado, com comentários, sempre terminar com `NOTIFY pgrst 'reload schema'`, usar `IF NOT EXISTS` para evitar erros em re-execução.

## Commands

```bash
npm run dev          # Start dev server (Vite)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run unit tests (Vitest, single run)
npm run test:watch   # Run tests in watch mode
```

Playwright e2e tests use `playwright.config.ts` — run with `npx playwright test`.

## Architecture

**Stack:** React 18 + TypeScript + Vite, Supabase (auth + Postgres), Tailwind CSS + shadcn/ui, React Router v6.

**What it is:** Cash flow management app for gas station chains ("postos"). Tracks Brinks armored car deposits, manual deposits, bank statements, and daily summaries per station.

### Auth & Access Control

`src/hooks/useAuth.tsx` is the central auth context. It exposes:
- `role`: `"admin"` or `"funcionario"` — determines nav items and data access
- `selectedPostoId`: the currently active station ID. Admins can switch between all stations via a header dropdown; funcionários are locked to one station via `user_posto` table.
- `allPostos`: list of stations (admin only)

All pages gate on `selectedPostoId` — if null, they render an empty state prompt.

### Data Layer

Pages query Supabase directly (no API abstraction layer). The Supabase client is in `src/integrations/supabase/client.ts`. Full TypeScript types for all tables are in `src/integrations/supabase/types.ts`.

Row-level security (RLS) is enforced at the DB level — admins have full access, funcionários see only their assigned posto via `user_posto`.

### Database Schema

Key tables:
- `postos` — gas stations (id, nome, cnpj)
- `depositos_brinks` — Brinks armored car deposits (grouped by `lote_id`, `turno`, `data_caixa`)
- `depositos_manuais` — manually entered deposits
- `contas_bancarias` — bank accounts linked to postos
- `extrato_bancario` — imported bank statements (OFX/fitid dedup), reconciled against brinks deposits
- `resumo_conferencia` — daily conference status (OK / PENDENTE / DIVERGÊNCIA) per data+centro_custo
- `relatorio_quality` — parsed Quality POS system PDF reports (unique on posto_id+data_caixa)
- `user_posto` — maps funcionários to their posto
- `user_roles` — app_role enum (admin | funcionario)

DB functions: `has_role(_role, _user_id)`, `get_user_posto_id(_user_id)`.

### Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/` | DepositosBrinks | Import/view Brinks deposits |
| `/manuais` | DepositosManuais | Manual deposit entries |
| `/resumo` | ResumoDiario | Daily summary cards with Quality PDF comparison |
| `/postos` | Postos | Admin: manage stations |
| `/usuarios` | Usuarios | Admin: manage users & roles |
| `/bancos` | ContasBancarias | Admin: manage bank accounts |
| `/extrato` | ExtratoBancario | Admin: bank statement import & reconciliation |

### Quality PDF Import

`src/lib/qualityParser.ts` parses PDFs from the Quality POS system using regex. Called from `ResumoDiario.tsx` via `pdfjs-dist` (browser-side parsing). Data upserted to `relatorio_quality` with conflict resolution on `(posto_id, data_caixa)`.

The parser extracts: `data_caixa`, `total_dinheiro_apurado`, `total_cartao`, `total_pix`, `total_vendas`, `total_despesas`, `diferenca_caixa`. Regex patterns may need calibration if the PDF format changes.

### Lançamento de Notas (Notas Fiscais de Compra)

New section for managing purchase invoices sent via Envio Rápido.

**Tables:**
- `notas_fiscais_compra` — purchase invoice records (posto_id, fornecedor, nf_path/type, boleto_path/type, status, enviado_por_nome)
- `notas_fiscais_compra_historico` — status change history (nota_id, status_anterior, status_novo, observacao, feito_por_nome)

**Status flow:** `Pendente` → `Lançado` | `Divergência` | `Cancelado` — any non-Pendente can revert to `Pendente`.
- Divergência and Cancelado require a mandatory observation.

**Storage:** Uses `documentos-comprovantes` bucket, subfolders:
- `notas-compra/{posto_id}/` — NF file
- `notas-compra-boleto/{posto_id}/` — boleto (optional)
- `notas-compra-mercadoria/{posto_id}/` — foto da mercadoria (optional)

**Permission:** `lancamento-notas` — admin only by default. Gerente has `envio-rapido` to submit but NOT `lancamento-notas` to manage.

**Pages:**
- `src/pages/notas/LancamentoNotas.tsx` — list with filters (posto, status, date range, fornecedor), status badges, file hover preview + modal, expandable history per note. Columns: Data de Chegada, Enviado em, Fornecedor, Posto, Enviado por, Arquivos (NF + boleto + mercadoria), Status, Observações.

**Envio Rápido** — `"Nota Fiscal de Compra"` type fields (in order):
1. Foto da Nota Fiscal (required)
2. Foto do Boleto (optional)
3. Foto da Mercadoria (optional)
4. Data de Chegada (required date)
5. Fornecedor (required)
6. Observações (optional)

**DB columns added after initial migration:**
```sql
ALTER TABLE notas_fiscais_compra ADD COLUMN mercadoria_path text;
ALTER TABLE notas_fiscais_compra ADD COLUMN mercadoria_type text;
ALTER TABLE notas_fiscais_compra ADD COLUMN data_chegada date;
```

### Status Badge Pattern

Status badges use inline Tailwind classes (not variants) for custom colors:
- `bg-yellow-500` Pendente / PENDENTE
- `bg-green-600` OK / Lançado
- `bg-red-500` Divergência / Vencido
- `bg-gray-400` Cancelado

### Custom Components

- `AppLayout` — sticky header + nav bar; admin header has posto switcher
- `FilterableHead` — table column with search/filter input
- `HorizontalScrollSync` — syncs horizontal scroll between elements
- `PaginationControls` — shared pagination UI
- `usePagination` hook — pagination state logic
- `DateFilter` + `useDateFilter` — shared date range filter bar with presets (Hoje / 7 dias / Este mês / Mês passado / custom). Uses `sessionStorage` key `financeiro_dateFilter` — all pages that use it share this state.
