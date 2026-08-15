# Budgeteer

A decentralized, private budgeting platform that runs entirely in your browser. No accounts, no servers, no tracking — your financial data never leaves your device.

[![Deploy to GitHub Pages](https://github.com/philcali/budgeteer/actions/workflows/deploy.yml/badge.svg)](https://github.com/philcali/budgeteer/actions/workflows/deploy.yml)

---

## Why Budgeteer?

### Your money data is yours

Every other budgeting app wants to know where you spend. They sell insights, build profiles, and monetize your habits. Budgeteer takes a different approach: **it's private to you**.

All data lives in your browser's `localStorage`. Nothing is sent to any server. You own your numbers, and you can export them to CSV at any time.

### Fork it, own it, run it

Budgeteer is designed to be forked. Deploy your own instance under your own domain with a single click — no backend to configure, no database to manage. It's a static React app that runs entirely client-side and deploys to any static host (GitHub Pages, Cloudflare Pages, Netlify, etc.).

> "The best budgeting tool is the one you control."

### Local-first, sync-ready

Built on a **Repository Pattern** abstraction, the app is architected to swap storage backends without touching the UI. The default `LocalStorageRepository` works today. A future `ApiRepository` can layer cloud sync on top when you're ready — but it's optional, never required.

---

## Features

- **Dashboard** — Monthly income, expenses, net flow, and savings rate at a glance
- **Transaction Ledger** — Full CRUD for income, expenses, and savings allocations
- **Savings Goals** — Track progress toward financial targets with real-time updates
- **Import Wizard** — Drag & drop CSV files or PDF bank statements with column mapping, duplicate detection, and preview before import
- **CSV Export** — Export all your data as a CSV file anytime
- **PWA Support** — Install as a progressive web app; works offline with automatic updates
- **Responsive Design** — Clean layout that works on desktop, tablet, and mobile

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| State | Zustand |
| Routing | React Router DOM |
| Icons | Lucide React |
| PDF Parsing | pdf-parse + pdfjs-dist |
| PWA | vite-plugin-pwa |
| Testing | Vitest |
| Deployment | GitHub Pages (static) |

---

## Getting Started

### Prerequisites

- Node.js >= 22

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build        # Development build
npm run build:deploy # Production build (sets BUDGETEER_DEPLOY=true)
```

### Test

```bash
npm test             # Run tests in watch mode
npm run test:coverage # Run with coverage report
```

---

## Architecture

### Repository Pattern

The UI layer communicates with storage exclusively through the `DataRepository` interface — no direct `localStorage` or API calls from components:

```typescript
interface DataRepository {
  getTransactions(): Promise<Transaction[]>
  addTransaction(t: Transaction): Promise<void>
  deleteTransaction(id: string): Promise<void>
  getGoals(): Promise<SavingsGoal[]>
  addGoal(g: SavingsGoal): Promise<void>
  updateGoal(g: SavingsGoal): Promise<void>
  deleteGoal(id: string): Promise<void>
  getMonthlySavings(month: string): Promise<MonthlySavings[]>
}
```

The default `LocalStorageRepository` implements this for browser storage. Swap it out for an `ApiRepository` when you need cloud sync — the UI doesn't change.

### Data Model

All currency amounts are stored as **integers (cents)** to avoid floating-point errors.

- **Transaction** — id, amount_cents, type (income/expense/savings), category, merchant, date
- **SavingsGoal** — id, name, target_amount_cents, current_amount_cents (derived), deadline, account

### Project Structure

```
src/
├── components/       # Shared UI components
│   ├── LayoutShell.tsx
│   └── ImportView.tsx
├── repositories/     # Data persistence layer
│   └── LocalStorageRepository.ts
├── store/            # Zustand global state
│   └── useBudgetStore.ts
├── types/            # Domain models & interfaces
│   └── index.ts
├── utils/            # Parsers, formatters, exporters
│   ├── csvParser.ts
│   ├── csvExport.ts
│   ├── deduplication.ts
│   ├── pdfExtract.ts
│   └── formatting.ts
└── views/            # Page-level components
    ├── DashboardView.tsx
    ├── TransactionsView.tsx
    ├── GoalsView.tsx
    └── ImportView.tsx
```

---

## Deploying Your Own Instance

Budgeteer is designed to be forked and deployed under your own domain.

### GitHub Pages (built-in)

1. Fork this repository
2. Go to **Settings → Pages → Source: GitHub Actions**
3. Push to `main` — the workflow will build and deploy automatically
4. Your app will be live at `https://<your-username>.github.io/<repo-name>/`

### Cloudflare Pages

1. Fork this repository
2. Connect your fork to Cloudflare Pages
3. Build command: `npm run build:deploy`
4. Output directory: `dist`

### Netlify

1. Fork this repository
2. Connect your fork to Netlify
3. Build command: `npm run build:deploy`
4. Publish directory: `dist`

---

## License

MIT — [Philip Cali](https://github.com/philcali) © 2026

Feel free to fork, modify, and deploy your own instance.
