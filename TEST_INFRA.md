# Test Infrastructure & Specification Document (TEST_INFRA.md)
**Project**: BudgetBakers-Inspired Statistics, Reports & Universal Filtering System  
**Track**: Dual-Track E2E & Requirement-Driven Testing  
**Application**: Firefly III Wallet Web Companion (`firefly-web`)  
**Version**: 2.0.0  
**Author**: Teamwork Test Writer E2E (`teamwork_test_writer_e2e_2`)  
**Target Feature Sets**: Universal Filtering Engine, Desktop PEMDAS Math Evaluator, BudgetBakers Reports Aggregations  

---

## 1. Test Philosophy & Dual-Track Methodology

This test infrastructure operates under an **opaque-box, requirement-driven, dual-track testing methodology**.
Testing is developed concurrently with feature implementation. Rather than asserting against private internal state or arbitrary implementation details, all tests assert against **authoritative specifications, mathematical invariants, and interface contracts** established in `ORIGINAL_REQUEST.md` and `PROJECT.md`.

Every test case answers the core question:
> *"If this test fails, what user-facing requirement, data aggregation invariant, or specification contract is broken?"*

```
+---------------------------------------------------------------------------------+
|  Tier 4: Real-World Application Scenarios                                       |
|  (Multi-step financial lifecycles, salary run, recurring bills, 30D runway)    |
+---------------------------------------------------------------------------------+
|  Tier 3: Cross-Feature Combinations                                             |
|  (Filter preset changes propagation to Reports, Stepping x Account net-worth)   |
+---------------------------------------------------------------------------------+
|  Tier 2: Boundary & Corner Cases                                                |
|  (Leap years, month length transitions, division by zero, float precision)      |
+---------------------------------------------------------------------------------+
|  Tier 1: Feature Coverage                                                       |
|  (Happy path contracts for Filters, Stepping, PEMDAS Math, 5 Report Aggregations)|
+---------------------------------------------------------------------------------+
```

### The 4-Tier Framework Hierarchy
1. **Tier 1: Feature Coverage (Primary Path Contract)**
   - Validates standard, expected user interactions and contract outputs.
   - Covers all period presets (`7D`, `30D`, `12W`, `6M`, `1Y`, `this_month`, `last_month`, `this_year`, `last_year`, `custom`).
   - Covers forward/backward stepping (`stepPeriod(direction)`).
   - Covers account filtering (`all_stats` default excluding non-net-worth accounts, `all`, `custom`).
   - Covers desktop transaction arithmetic with PEMDAS precedence (`150 + 25 * 3 = 225`).
   - Covers all 5 Report aggregation tabs (Balance Trend, Cash-flow, Spending Donut, 30-Day Outlook, Debt Gauge).

2. **Tier 2: Boundary & Corner Cases (Robustness & Edge Conditions)**
   - Tests boundary timestamps, month length differences (28, 29, 30, 31 days), leap years (Feb 29), and year boundary rollovers.
   - Tests arithmetic edge cases: division by zero, unclosed parentheses, extreme whitespace, sub-cent decimal values, large financial balances.
   - Tests financial report edge cases: zero previous balance, zero income with active expenses, zero credit limit, negative net savings.

3. **Tier 3: Cross-Feature Combinations (Pairwise Interoperability)**
   - Validates the interaction between Universal Filtering and Report calculations.
   - Tests account selection changes dynamically updating net worth and debt gauges.
   - Validates URL query synchronization and `sessionStorage` round-trip state preservation.
   - Tests rapid sequential stepping and chained denomination increments (`+10`, `+50`, `+100`).

4. **Tier 4: Real-World Application Scenarios (End-to-End User Journeys)**
   - Models realistic end-to-end user workflows:
     - Full monthly household budget cycle (paycheck deposit, recurring bills, credit card usage).
     - 30-day cash runway projection evaluating minimum balance dates.
     - Multi-period trend analysis comparing savings rate and balance growth over time.

---

## 2. Feature Inventory Mapping & Test Coverage Matrix

| Feature ID | Feature Name | Description & Invariants | Target Test File | Coverage Tiers |
| :--- | :--- | :--- | :--- | :---: |
| **FEAT-FILT-1** | Filter Presets | Date calculation for `7D`, `30D`, `12W`, `6M`, `1Y`, `this_month`, `last_month`, `this_year`, `last_year`, and `custom`. | `src/test/filter-engine.test.ts` | Tier 1, 2, 3 |
| **FEAT-FILT-2** | Period Stepping | `stepPeriod(direction: -1 \| 1)` stepping forward/backward with leap year and month boundary awareness. | `src/test/filter-engine.test.ts` | Tier 1, 2, 3 |
| **FEAT-FILT-3** | Account Net-Worth Filter | Default "All without excluded from stats" using Firefly's `include_net_worth !== false` contract. | `src/test/filter-engine.test.ts` | Tier 1, 2, 3 |
| **FEAT-FILT-4** | State Serialization | URL query string and `sessionStorage` synchronization (`?period=...&start=...&end=...`). | `src/test/filter-engine.test.ts` | Tier 2, 3 |
| **FEAT-MATH-1** | PEMDAS Precedence | Multiplication/division evaluated before addition/subtraction (`150 + 25 * 3 = 225`). | `src/test/math-evaluator.test.ts` | Tier 1, 2, 3 |
| **FEAT-MATH-2** | Parentheses & Sub-expressions | Explicit grouping `(150 + 25) * 3 = 525` and nested expressions. | `src/test/math-evaluator.test.ts` | Tier 1, 2, 3 |
| **FEAT-MATH-3** | Decimal.js Precision | Floating-point accuracy without binary rounding errors (`0.1 + 0.2 = 0.3`). | `src/test/math-evaluator.test.ts` | Tier 1, 2 |
| **FEAT-MATH-4** | Error & Zero Fallback | Division by zero, malformed syntax (`150 + +`), empty strings gracefully handled without throwing. | `src/test/math-evaluator.test.ts` | Tier 2 |
| **FEAT-MATH-5** | Denomination Chips | Quick amount increment buttons (`+10`, `+50`, `+100`) combined with active expressions. | `src/test/math-evaluator.test.ts` | Tier 1, 3 |
| **FEAT-REP-1** | Balance Trend Past % | Trend comparison `((current - previous) / abs(previous)) * 100` and cumulative spline balances. | `src/test/reports-aggregations.test.ts` | Tier 1, 2, 3, 4 |
| **FEAT-REP-2** | Cash-Flow KPIs | Inflow, Outflow, Net Saved (`inflow - outflow`), Savings Rate % (`netSaved / inflow * 100`). | `src/test/reports-aggregations.test.ts` | Tier 1, 2, 3, 4 |
| **FEAT-REP-3** | Spending Category Donut | Category breakdown percentages, descending order, daily average spend (`total / days`). | `src/test/reports-aggregations.test.ts` | Tier 1, 2, 3, 4 |
| **FEAT-REP-4** | 30-Day Cash Outlook | 30-day forward projection factoring recurrences and unpaid bills, identifying minimum balance date. | `src/test/reports-aggregations.test.ts` | Tier 1, 2, 3, 4 |
| **FEAT-REP-5** | Debt & Credit Gauge | Total liability balances, credit card debt, total credit limit, utilization rate percentage. | `src/test/reports-aggregations.test.ts` | Tier 1, 2, 3, 4 |

---

## 3. Test Architecture & Directory Layout

The test suite runs under Vitest in the `firefly-web` package:

```
firefly-web/
├── vitest.config.mts                     # Vitest configuration with @ alias
└── src/
    └── test/
        ├── test-harness.ts               # Core test harness, contract reference specs, mock factories
        ├── filter-engine.test.ts         # Filter engine test suite (Tiers 1-3)
        ├── math-evaluator.test.ts        # Math evaluator test suite (Tiers 1-3)
        ├── reports-aggregations.test.ts  # Reports calculations test suite (Tiers 1-4)
        ├── accounts.test.ts              # Existing R1 account creation tests
        ├── analytics.test.ts             # Existing R2 account analytics tests
        ├── theme.test.ts                 # Existing R3 theme tests
        └── accessibility.test.ts         # Existing R4 usability tests
```

### Authoritative Output Derivation
1. **Mathematical Invariants**: Precedence rules (PEMDAS), formula derivations (percentage changes, utilization ratios, savings rates) use `Decimal.js` for arbitrary precision arithmetic.
2. **Calendar Invariants**: Explicit Gregorian calendar arithmetic accounting for leap years (2024, 2028), non-leap years (2025, 2026), and month length boundaries (28, 29, 30, 31 days).
3. **Specification Contracts**: Interface structures declared in `PROJECT.md` (§ Interface Contracts) define exact input/output signatures.

---

## 4. Execution & Verification Commands

```bash
# Execute entire test suite
npm --prefix firefly-web test

# Execute individual test suites
npx --prefix firefly-web vitest run src/test/filter-engine.test.ts
npx --prefix firefly-web vitest run src/test/math-evaluator.test.ts
npx --prefix firefly-web vitest run src/test/reports-aggregations.test.ts

# Execute typecheck
npm --prefix firefly-web run typecheck
```

---

## 5. Pass/Fail & Quality Gates

1. **Zero Flakiness**: All tests are deterministic with pure time/date injection and mock isolation.
2. **No Regression**: Existing test suites (`accounts`, `analytics`, `theme`, `accessibility`, `fx`) must continue to pass 100%.
3. **Comprehensive Coverage**:
   - `filter-engine.test.ts`: >= 20 tests across Tiers 1-3.
   - `math-evaluator.test.ts`: >= 20 tests across Tiers 1-3.
   - `reports-aggregations.test.ts`: >= 25 tests across Tiers 1-4.
   - Overall suite: >= 170 passing tests.
