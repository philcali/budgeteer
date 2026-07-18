# 🚀 Project Budgeteer: Implementation Roadmap

A phased, modular approach to building a high-performance, clean-UI budgeting application.

## 🎯 Project Vision
A simple CRUD application for tracking monthly income, expenses, and savings goals.
*   **Core Philosophy:** "Local-First" moving to "Cloud-Sync."
*   **Design Principle:** Decoupled architecture using the **Repository Pattern** to allow seamless transitions between storage layers without UI rewrites.
*   **UX Goal:** Clean, responsive, and data-focused.

---

## 🛠️ Technical Stack

### Phase 1 (Client-Side)
*   **Frontend Framework:** React (via Vite) + TypeScript
*   **UI Library:** `react-bootstrap` (Bootstrap 5)
*   **Styling:** Custom CSS (avoiding Tailwind "class soup")
*   **Icons:** `lucide-react`
*   **Charts:** `recharts`
*   **State Management:** `Zustand` (Global Store)
*   **Persistence:** `window.localStorage`

### Phase 2 (Serverless Full-Stack)
*   **Frontend:** (No changes to UI/Logic)
*   **Compute:** AWS Lambda (Node.js/TypeScript)
*   **API Gateway:** Amazon API Gateway (RESTful)
*   **Database:** Amazon DynamoDB (NoSQL, Single Table Design)
*   **Infrastructure:** AWS SAM or CDK (Infrastructure as Code)

---

## 🏗️ Architectural Foundation: The Repository Pattern

The UI components interact **only** with a `DataRepository` interface. This abstraction is the key to the Phase 1 $\rightarrow$ Phase 2 transition.

```typescript
interface DataRepository {
  getTransactions(): Promise<Transaction[]>;
  addTransaction(t: Transaction): Promise<void>;
  deleteTransaction(id: string): Promise<void>;
  getGoals(): Promise<Goal[]>;
  addGoal(g: Goal): Promise<void>;
}
```

---

## 🗺️ Implementation Phases

### Phase 1: The "Local-First" Build (MVP)
*Goal: A fully functional SPA that runs entirely in the browser.*

#### 1. Setup & Scaffolding
- [ ] Initialize Vite + React + TypeScript project.
- [ ] Install `bootstrap`, `react-bootstrap`, `lucide-react`, `zustand`, `recharts`, `react-router-dom`.
- [ ] Establish folder structure: `/src/components`, `/src/views`, `/src/store`, `/src/repositories`, `/src/types`, `/src/hooks`.

#### 2. Domain Modeling (The "Source of Truth")
- [ ] Define TypeScript interfaces for `Transaction`, `Income`, `Expense`, and `SavingsGoal`.
- [ ] **Rule:** All currency amounts must be stored as **integers (cents)** to avoid floating-point errors.

#### 3. The Data Layer (LocalStorage)
- [ ] Implement `LocalStorageRepository.ts` adhering to the `DataRepository` interface.
- [ ] Create utility helpers for JSON serialization/deserialization of `localStorage`.

#### 4. State Management
- [ ] Set up the `useBudgetStore` (Zustand) to manage current state and trigger repository updates.
- [ ] Implement "Asynchronous Actions" in the store to simulate API latency (300ms) for a realistic UX.

#### 5. UI Development (Container/Presentational Pattern)
- [ ] **Shell:** Build `AppNavbar`, `Sidebar` (Offcanvas for mobile), and `LayoutShell`.
- [ ] **Dashboard View:** Build `StatTile`, `ChartSection`, and `GoalGrid`.
- [ ] **Ledger View:** Build `TransactionList`, `MonthSelector`, and `TransactionModal`.
- [ ] **Goals View:** Build `GoalGrid` and `GoalModal`.

---

### Phase 2: The "Cloud-Sync" Transition
*Goal: Move data to the cloud and enable multi-device persistence.*

#### 1. Backend Infrastructure (Serverless)
- [ ] Set up AWS SAM/CDK project structure.
- [ ] Define DynamoDB Schema (Single Table Design: `PK` = `USER#<Id>`, `SK` = `TRANS#...` or `GOAL#...`).
- [ ] Implement AWS Lambda functions for CRUD operations (Get, Create, Delete).
- [ ] Configure API Gateway to route requests to Lambda.

#### 2. The "Great Swap"
- [ ] Implement `ApiRepository.ts` adhering to the `DataRepository` interface (using `fetch`).
- [ ] Inject `ApiRepository` into the `AppProvider` at the root, replacing `LocalStorageRepository`.

#### 3. Data Migration
- [ ] Develop a "Migration Utility" that reads `localStorage` and performs a bulk upload to the new DynamoDB backend.
- [ ] Implement a "One-Time Migration" check to run upon the first user login.

---

## 📊 Data Model Reference (Final Schema)

### **Transaction**
- `id`: UUID
- `amount_cents`: Integer
- `type`: `'income' | 'expense'`
- `category`: String
- `merchant`: String
- `date`: ISO Date String
- `description`: String (Optional)

### **Savings Goal**
- `id`: UUID
- `name`: String
- `target_amount_cents`: Integer
- `current_amount_cents`: Integer
- `deadline`: ISO Date String
