# FireFly 💸

> **Modern, Fast & Intelligent Companion for Firefly III**  
> Streamlined multi-currency personal finance, live exchange-rate transfers, customizable Bento dashboard, AI transaction parsing, and debits/liabilities tracking.

[![Next.js 16](https://img.shields.io/badge/Next.js-16.4.3-black?logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.3.0-blue?logo=react)](https://react.dev/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vitest](https://img.shields.io/badge/Vitest-passing-green?logo=vitest)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Key Highlights

### ⚡ Smart Multi-Currency & Cross-Currency Transfers
- **Automated Rate Resolution**: Retrieves and evaluates rates stored in Firefly III (`/api/v1/exchange-rates`) as of the transaction date.
- **Triangulation Engine**: Resolves rates across direct currency pairs, reciprocal inverse pairs (`1 / rate`), and multi-hop triangulation via your primary currency.
- **Two-Way Linked Precision Math**: Powered by `decimal.js` for financial calculation accuracy without IEEE 754 float rounding errors. Changing either source or destination amount dynamically recalculates the reciprocal with live post-balance previews.
- **Inline Rate Override**: Edit or unlink rates on-the-fly and save the implied rate back to your Firefly III server with one tap.

### 📊 Modular Customizable Bento Dashboard
- **16 Configurable Bento Cards**: Net Worth overview, Financial Health gauges, Cash Flow analytics, Debts & Liabilities progress, Top Spending Categories, Payees, Largest Expenses, Upcoming Bills, Piggy Banks, and 6-Month Income vs Expense bar charts.
- **Responsive Layout**: Adapts automatically between mobile phone single-stack and desktop multi-column Bento grids.
- **Dedicated Liabilities & Debt Analytics**:
  - Global KPI cards: *Paid so far*, *Remaining principal*, and *Expected installment*.
  - Visual stacked bar chart tracking payment milestones per liability.
  - Payoff progress bars, next due dates, and estimated payoff timelines.
- **Smart Account Tiles**:
  - Automatically isolates net-worth asset accounts from liabilities.
  - Multi-select account filter with unclipped balance formatting.
  - Custom color-coded indicators with custom entity icons.

### 🎙️ Ramble AI Magic Assistant
- **Fast-Access Chatbar**: Quick transaction capture powered by AI.
- **Voice & Ramble Input**: Dictate expenses on mobile or paste conversational notes (e.g. *"Paid 12.5 BHD for dinner at Lanterns using ila Bank with Ali"*).
- **Multi-Model Support**: Compatible with Google Gemini API, OpenAI (`gpt-4o-mini`), and local Ollama endpoints.
- **Attachment Support**: Upload receipts and bills for visual context.

### 🏷️ Intuitive Daily Expense Entry
- **Category Cascade Menu**: Visual icon chips and grouped categories for rapid selection.
- **Keyboard Shortcuts**: Quick creation workflows (`N` for new expense, `T` for transfer).
- **Instant Search & Filters**: Multi-criteria transaction filtering across types, tags, counterparties, accounts, and date ranges.

### 🔒 Privacy & Architecture
- **Zero Token Leaks**: Personal Access Tokens and server URLs are encrypted in an `httpOnly`, `SameSite=Lax` cookie via AES-256-GCM.
- **CORS-Free Companion Proxy**: Next.js server-side route proxies eliminate browser CORS issues.
- **Embedded SQLite Companion Database**: Keeps custom entity icons, color schemes, and transaction templates isolated and persistent.
- **PWA Ready**: Installable to iOS / Android home screens with offline shell capabilities.

---

## 🚀 Quick Deployment with Docker Compose

A complete production stack containing FireFly Companion, Firefly III core, PostgreSQL, and Alpine Cron is ready to deploy.

### 1. Clone & Configure
```bash
git clone https://github.com/Edogawa-APTX4869/Wallet.git
cd Wallet
```

### 2. Launch the Stack
```bash
docker compose up -d --build
```

### 3. Open the Services
- **FireFly Companion App**: [http://localhost:3000](http://localhost:3000)
- **Firefly III Core**: [http://localhost:8080](http://localhost:8080)

For detailed step-by-step instructions, see [`create.md`](./create.md).

---

## 💻 Local Development

### Requirements
- **Node.js** 20+ (Node 24 supported)
- **npm** 10+
- A running Firefly III server (v6.2+)

### Commands

```bash
# Install root & web dependencies
npm install

# Start Next.js development server
npm run dev

# Run TypeScript type generation & strict check
npm run typecheck

# Run ESLint
npm run lint

# Run Vitest test suite
npm test

# Build production bundle
npm run build

# Start production server
npm start
```

---

## 📁 Repository Structure

```
FireFly/
├── docker-compose.yml       # Production Portainer / Synology NAS 4-container stack
├── package.json             # Root monorepo script runner
├── .gitignore               # Root git exclusion rules
├── create.md                # Quickstart & instance creation guide
├── README.md                # Comprehensive documentation & architecture
└── firefly-web/             # Next.js 16 companion web application
    ├── Dockerfile           # Optimized multi-stage Docker build
    ├── next.config.ts       # Next.js & Turbopack configuration
    ├── vitest.config.mts    # Vitest test runner configuration
    ├── public/              # PWA manifest, service worker, icons
    └── src/
        ├── app/             # App Router pages & API routes
        │   ├── (app)/       # Authenticated dashboard, accounts, transactions
        │   ├── api/         # Companion backend proxy & SQLite handlers
        │   └── login/       # Firefly III authentication & token setup
        ├── components/      # UI components, icons, modals, category selector
        └── lib/             # API client, FX triangulation, formatters, hooks
```

---

## 🛡️ License

This project is open-source under the [MIT License](LICENSE).
