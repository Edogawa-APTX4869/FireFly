# FireFly — Modern Client for Firefly III

A fast, responsive, installable (PWA) web client for **Firefly III**, focused on streamlined transaction entry and **automatic cross-currency transfers** powered by the exchange rates already stored in your Firefly III server.

## Highlights

- **Smart Cross-Currency Transfers**:
  - Automatically looks up exchange rates stored in Firefly III (`/api/v1/exchange-rates`) using the latest rate dated on or before the transaction date.
  - Resolves rates in order: **Same currency** → **Direct pair** → **Inverse pair (`1 / rate`)** → **Triangulated via your primary currency**.
  - **Two-way linked amount inputs**: edit either the source amount or the destination amount and the other recalculates immediately using `decimal.js`.
  - Override the rate inline or unlink to enter exact bank amounts, with a one-click option to **save the implied rate back to Firefly III**.
  - Swap accounts (`⇄`), preview post-transfer balances on both accounts, and reuse recent account pairs with one tap.
- **Secure Server Proxy**:
  - Your Firefly III URL and Personal Access Token are encrypted with AES-256-GCM into an `httpOnly` cookie (`ff_session`). The token is never exposed to browser JavaScript, and CORS issues are eliminated.
- **Complete Daily Workflow**:
  - **Dashboard**: Net worth converted to your primary currency, balances by currency, 6-month Income vs. Expense bar chart, 30-day Balance Trend area chart, active budget progress, and recent transactions.
  - **Accounts**: Grouped by Asset, Liabilities, Expense, and Revenue with live conversion to your primary currency, plus per-account transaction history.
  - **Expense / Income / Transfer Entry**: Keyboard shortcuts (`N` for expense, `T` for transfer), foreign-currency expenses with auto-conversion, and autocomplete for counterparties, categories, budgets, and tags.
  - **Transactions**: Full search and multi-criteria filtering (`type:`, `account_id:`, `category_is:`, `tag_is:`, `budget_is:`, date range, amount range) with infinite scroll.
  - **Budgets, Categories & Tags**: Monthly budget limits with progress bars, and full create/rename/delete management for categories and tags.
  - **Settings & Exchange Rate Manager**: Inspect server connection, switch color scheme (System / Light / Dark), and view, add, or delete stored exchange rates.

## Requirements

- **Node.js** 20+ (tested on Node 24)
- A running **Firefly III** instance (v6.2+ recommended for the `/api/v1/exchange-rates` endpoints) and a **Personal Access Token** (created in Firefly III under *Options → Profile → OAuth → Personal Access Tokens*).

## Getting Started

```bash
cd firefly-web

# 1. Install dependencies
npm install

# 2. Configure session encryption secret
cp .env.example .env.local
# Edit .env.local and set SESSION_SECRET to a random 32+ byte string

# 3. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter your Firefly III URL and Personal Access Token.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Build production bundle |
| `npm start` | Start production server |
| `npm test` | Run Vitest unit tests (exchange-rate resolver & math) |
| `npm run typecheck` | Regenerate route types and run TypeScript compiler check |
| `npm run lint` | Run ESLint |
