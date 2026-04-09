# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Custom Components

- `AppLayout` — sticky header + nav bar; admin header has posto switcher
- `FilterableHead` — table column with search/filter input
- `HorizontalScrollSync` — syncs horizontal scroll between elements
- `PaginationControls` — shared pagination UI
- `usePagination` hook — pagination state logic
