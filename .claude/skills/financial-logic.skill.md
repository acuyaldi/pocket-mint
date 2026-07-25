---
name: financial-logic
description: Use when working on wallets, transactions, transfers, installments, dashboard aggregates, reporting periods, or balance reconciliation.
---

# Financial Logic — Pocket Mint Backend

**Source of truth:** This document, reconciled against PD-001 (Approved), the
backend implementation, and the automated test suite. It covers financial
invariants only — it does not track a fixed test count or a single
reconciliation date, since both the implementation and the suite continue to
grow. When code, tests, and this document disagree, verify against the
current implementation and tests first, then flag the conflict rather than
silently "fixing" code to match stale documentation.

Hierarchy: **Approved PD** > **Tests that verify approved behavior** >
**Backend implementation** > **This document** > UI wording.

---

## 0. Assistant-Originated Transactions

- Assistant/LLM interpretation may prepare a **Pending Financial Draft**. A
  draft is not a `Transaction` and causes no balance mutation.
- No final financial `Transaction` may be created from Assistant output
  without **explicit user confirmation** of that specific draft.
- The confirmation path must call into the canonical transaction creation
  service (`transaction.service.ts`) — it must never reimplement balance
  mutation, credit-limit checks, or installment creation itself.
- Assistant lifecycle mechanics (clarification, entity resolution, draft
  expiry, confirmation endpoints) are owned by `assistant-core.skill.md`; this
  file only owns the financial invariant above.

---

## 1. Wallet Classification

### Asset wallets

`CASH`, `BANK`, `E_WALLET`

- Balance stored as **positive** (Rp 5.000.000,00 = `5000000.00`).
- Contribute to `totalAset` at face value.
- Source: `classifyWalletForNetWorth` in `src/utils/financial.ts`.

### Debt wallets

`CREDIT_CARD`, `PAYLATER`, `LOAN`

- Outstanding debt stored as **negative** balance (Rp 2.000.000,00 utang = `-2000000.00`).
- `totalUtang` = `abs(balance)` — always a positive number for display.
- Classification is by wallet **type**, never by balance sign.
- `LOAN` is a debt wallet whose opening balance is `-principal` (set at create,
  `wallet.service.ts:120`). LOAN rejects credit billing fields (`creditLimit`,
  `cutoffDay`, `paymentDueDay`).
- Source: `classifyWalletForNetWorth` in `src/utils/financial.ts`.

### Wallet create rules

| Rule | Enforcement |
|---|---|
| Asset opening balance ≥ 0 | Backend (`wallet.service.ts:107-108`) |
| CREDIT_CARD/PAYLATER requires `creditLimit > 0` | Backend (`wallet.service.ts:93-98`) |
| LOAN requires `principal > 0` | Backend (`wallet.service.ts:113-115`) |
| LOAN rejects `creditLimit`/`cutoffDay`/`paymentDueDay` | Backend (`wallet.service.ts:117-118`) |
| Balance is NEVER editable via wallet update | Backend (`BALANCE_UPDATE_NOT_ALLOWED`, `wallet.service.ts:208-222`) |

---

## 2. Net Worth (PD-001 — Approved)

```
totalAset  = Σ(balance) for ASSET wallets (CASH, BANK, E_WALLET)
totalUtang = Σ(|balance|) for DEBT wallets (CREDIT_CARD, PAYLATER, LOAN)
netWorth   = totalAset − totalUtang
```

### Concrete example

| Wallet | Type | Balance |
|---|---|---|
| BCA | BANK | 5.000.000,00 |
| GoPay | E_WALLET | 500.000,00 |
| Mandiri CC | CREDIT_CARD | −2.000.000,00 |
| Akulaku | PAYLATER | −1.000.000,00 |

```
totalAset  = 5.000.000 + 500.000 = 5.500.000
totalUtang = 2.000.000 + 1.000.000 = 3.000.000
netWorth   = 5.500.000 − 3.000.000 = 2.500.000
```

### Rules

- Net worth **may be negative**. Never clamp to zero.
- `totalUtang` is **always** the absolute value of debt balances — displayed as
  a positive number.
- Installment debt is **already counted exactly once** inside the wallet's
  outstanding balance. Do NOT subtract installment `grandTotal` again.
- All three values (`totalAset`, `totalUtang`, `netWorth`) are computed from
  the same wallet snapshot (same reporting cutoff). Never mix snapshots.
- Source: `calculateNetWorth` in `src/utils/financial.ts`.
- Test: `dashboardQueryService.test.ts` — 8 cases, explicit PD-001 assertion.

### Historical note (deprecated)

A previous July 2026 product decision defined `netWorth = Σ(ASSET balances)`
(assets only, debt excluded). That decision was superseded by **PD-001
(Approved 2026-07-14)**. The old formula is **no longer valid anywhere**.
If you encounter code or documentation claiming assets-only net worth,
flag it — do not replicate it.

---

## 3. Transaction Effects

Single source of truth: `computeBalanceEffect` / `reverseBalanceEffect` /
`applyBalanceDeltas` in `src/domain/transactionBalance.ts`.
Never re-implement the switch — reuse these functions.

### INCOME

- **Effect:** `+amount` to source wallet.
- **Net Worth impact:** Increases `totalAset` (if wallet is ASSET).
  Increases net worth.
- **Validation:** Source wallet must be ASSET (`CASH`/`BANK`/`E_WALLET`).
  INCOME targeting CREDIT_CARD, PAYLATER, or LOAN is **rejected** with 400.
  Source: `transaction.service.ts:141-143`. Tested: PM-STAB-007 cases.

### EXPENSE

- **Effect:** `−amount` from source wallet.
- **Net Worth impact:** Decreases `totalAset` (if wallet is ASSET).
  Decreases net worth.
- **Validation:** LOAN wallet rejected as expense source
  (`transaction.service.ts:138-139`).

### TRANSFER (asset-to-asset)

- **Effect:** `−amount` source, `+amount` destination. One `Transaction` row
  with `walletId` + `toWalletId`.
- **Net Worth impact:** **Zero.** Total assets unchanged — this is value
  relocation, not creation or destruction. Net worth invariant is preserved.
- **Validation:** Source must be CASH/BANK/E_WALLET (`TRANSFER_SOURCE_TYPES`).
  Source ≠ destination. Source balance must be sufficient. Destination must
  belong to same user. Category forbidden.

### TRANSFER (debt repayment / installment payment)

- **Effect:** `−amount` from ASSET source, `+amount` (credit) to DEBT wallet.
- **Recorded as:** `type: "TRANSFER"` — **NOT EXPENSE**.
- **Net Worth impact:** **Zero at the moment of payment.** Assets shrink and
  debt shrinks by the same amount, so net worth is unchanged. The expense
  that created the debt already reduced net worth at creation time.
- Source: `installment-payment.service.ts:99-103`.
- Tested: `installmentPaymentService.test.ts`.

### Summary: Which transactions affect Net Worth?

| Transaction | Net Worth change |
|---|---|
| INCOME to ASSET wallet | **+amount** (assets ↑) |
| EXPENSE from ASSET wallet | **−amount** (assets ↓) |
| CREDIT EXPENSE (installment create) | **−grandTotal** (debt ↑, net worth ↓) |
| TRANSFER asset → asset | **0** (value relocation only) |
| TRANSFER asset → debt (payment) | **0** (assets ↓, debt ↓, cancel out) |
| TRANSFER debt → anything | Rejected (debt cannot be transfer source) |

### TRANSFER destination hardening note

Backend does NOT restrict TRANSFER destination wallet type at the generic
endpoint (`POST /v1/transactions`). Only the source type is restricted.
Frontend restricts destination to ASSET wallets. A direct API call could
transfer into a DEBT wallet outside the installment payment flow —
mathematically net-worth-neutral but would desync `paidTerms` from wallet
balance. Low risk (not reachable from UI). Guard tracked as hardening item.

---

## 4. Credit / PayLater Expense (Installment Creation)

When an EXPENSE transaction uses a CREDIT_CARD or PAYLATER source wallet,
the backend **always** creates an Installment row. This is a single code path
in `transaction.service.ts:createTransaction`, `isCreditExpense` branch.

### Two billing modes

| Mode | `kind` | `installmentMonths` | Tenor validation |
|---|---|---|---|
| `FULL` | `FULL` | 1 | Full payment next cycle |
| `INSTALLMENT` | `INSTALLMENT` | 2–120 | Minimum 2 terms |

### Installment plan arithmetic

```
totalInterest = round(principal × (rate/100) × months)   // flat interest
grandTotal    = round(principal + totalInterest)           // total liability
monthlyAmount = round(grandTotal / months)                // recurring term
finalMonthlyAmount = grandTotal − monthlyAmount × (months − 1)
```

All in `Prisma.Decimal`, `ROUND_HALF_UP`, scale 2. Source:
`src/domain/installment.ts`.

### Example (principal 100.000, rate 2.6%, 3 months)

```
totalInterest    = round(100000 × 0.026 × 3) = 7.800
grandTotal       = 107.800
monthlyAmount    = round(107800 / 3) = 35.933,33
finalMonthlyAmount = 107800 − 35933.33 × 2 = 35.933,34
```

Schedule: term 1 = 35.933,33 | term 2 = 35.933,33 | term 3 = 35.933,34 → sums to 107.800,00 exactly.

### Balance effect at creation

- Wallet is debited by **`grandTotal`** (full liability) at creation time.
  NOT by `monthlyAmount`. This is a single atomic `$transaction`.
- The `Transaction` row stores `monthlyAmount` for display, but
  `computeBalanceEffect` with `isInstallment: true` + `installmentGrandTotal`
  always uses `grandTotal` for the wallet debit.
- Source: `transaction.service.ts:246`, `transactionBalance.ts:66-73`.

### Credit limit check

```
outstanding     = |balance|                    // current debt (positive number)
remainingCredit = max(creditLimit − outstanding, 0)
```

If `grandTotal > remainingCredit` → `INSUFFICIENT_CREDIT` (400). No write occurs.
Source: `transaction.service.ts:202-208`.

### Validation summary

| Rule | Enforcement |
|---|---|
| Credit expense only from CREDIT_CARD/PAYLATER | Backend |
| LOAN rejected as expense source | Backend |
| Credit limit must not be exceeded | Backend |
| Interest 0–100% | Backend |
| `installmentMonths` 1–120 | Backend |
| INSTALLMENT mode requires ≥ 2 months | Backend |
| `cutoffDay` + `paymentDueDay` required (or `firstDueDate` supplied) | Backend |
| `firstDueDate` computed from cutoff cycle (`billingCycle.ts`) | Backend |

---

## 5. Installment Payment (Debt Settlement)

Endpoint: `POST /v1/bills/:id/pay` (alias `/v1/installments/:id/pay`).
Service: `installment-payment.service.ts:payInstallment`.

### Payment rules

- Installment must be `ACTIVE` and not fully paid.
- Payment source: `BANK`, `CASH`, or `E_WALLET` (`ALLOWED_SOURCE_TYPES`).
  **E_WALLET IS allowed** — confirmed by implementation and tests.
- Payment amount must equal `expectedAmount`:
  - Regular term: `installment.monthlyAmount`
  - Final term: `computeFinalMonthlyAmount(grandTotal, monthlyAmount, months)`
    (absorbs the rounding remainder).
- Payment recorded as `type: "TRANSFER"` (NOT expense) — one row with
  `walletId` = source, `toWalletId` = debt wallet.
- All within one `$transaction`: create Transaction row + 2× wallet update +
  update Installment (`paidTerms` + `nextDueDate` + `status`).

### Term progression

```
nextPaidTerms = paidTerms + 1
isFinalTerm   = nextPaidTerms >= installmentMonths
nextStatus    = isFinalTerm ? SETTLED : ACTIVE
nextDueDate   = SETTLED ? unchanged : addBillingMonth(current, 1)
```

### finalMonthlyAmount in payment

The final term uses `computeFinalMonthlyAmount` so the schedule sums to
`grandTotal` exactly. Paying the regular `monthlyAmount` on the final term
is **rejected** (`INVALID_AMOUNT`). Omitting `amount` in the request body
(or passing the exact computed amount) charges the correct final amount.

Source: `installment-payment.service.ts:60-72`.
Tested: `installmentPaymentService.test.ts` — PM-STAB-006.

---

## 6. Installment Settlement (SETTLED Status)

- `status = SETTLED` when `paidTerms >= installmentMonths` after the final
  payment.
- Once SETTLED, `payInstallment` rejects further payments with
  `"Tagihan sudah lunas"` (409 CONFLICT).
- After SETTLED, the debt wallet balance should be **exactly zero** (all
  `grandTotal` has been repaid through TRANSFER payments).
- The `finalMonthlyAmount` mechanism ensures the repayment schedule sums to
  `grandTotal` exactly — no rounding remainder trapped in the wallet.
- Source: `installment-payment.service.ts:56-57, 89-90`.

---

## 7. Double Deduction Prevention

- **Create:** `applyBalanceDeltas` uses atomic `balance: { increment }` —
  no read-modify-write race.
- **Update:** Reverse persisted old effect → update row → apply new effect.
  Both derived from stored DB row, never from request data.
- **Delete:** Reverse the persisted effect from the stored row.
  Installment delete reverses `grandTotal` (not `monthlyAmount`).
- **Installment payment:** Creates exactly one TRANSFER row. The original
  expense already deducted the wallet at creation; the payment does NOT
  deduct again — it moves money from asset to debt wallet (transfer, not expense).
- **Multi-step mutations:** All wrapped in `db.$transaction(...)` — atomic
  commit or full rollback. No partial writes.

Source: `transaction.service.ts`, `installment-payment.service.ts`,
`transactionBalance.ts`.

---

## 8. Transaction Update and Delete

### Update rules

- Installment-linked transactions: **refused** (409 CONFLICT).
  Manage installments through their dedicated endpoint.
- Legacy transfers (missing `toWalletId`): **refused** (409).
  Delete and recreate.
- Non-installment update: reverse-then-apply inside `$transaction`.
- Re-targeting an INCOME onto a DEBT wallet during update: **rejected** before
  any write (PM-STAB-007 guard on update path too).
- Source: `transaction.service.ts:294-437`.

### Delete rules

- Non-installment: reverse the exact persisted effect, delete row.
- Installment: reverse the persisted `grandTotal` effect (NOT `monthlyAmount`),
  delete Transaction row, then delete Installment row. All in `$transaction`.
- Legacy transfer without `toWalletId`: **refused** (409).
  Manual reconciliation required.
- Source: `transaction.service.ts:446-498`.

---

## 9. Reporting Cutoff and Timezone

- **Reporting timezone:** `Asia/Jakarta` (configurable via `REPORTING_TIMEZONE`
  env var, defaults to `Asia/Jakarta`).
- **Date parsing:** Date-only strings (`2026-07-18`) resolve to reporting-local
  midnight. Full timestamps must carry an offset or `Z`.
- **Period boundaries:** Half-open `[startInclusive, endExclusive)` —
  NEVER use `lte` on end bounds.
- **Source:** `src/domain/reportingTime.ts`, `src/config/index.ts`.

### Reporting month

```
Month 2026-07: [2026-07-01T00:00:00+07:00, 2026-08-01T00:00:00+07:00)
```

### Transaction date semantics

- `Transaction.date` is the **business date** (when the transaction happened).
- `Transaction.createdAt` is the audit/tie-breaker timestamp only.
- All reporting queries filter on `date`, not `createdAt`.

### Sparkline

- Seven reporting-calendar days, oldest → newest.
- Points before wallet creation date are `null` (never `0`).
- Computed from current balance walked backwards through effects.
- Future-dated transactions excluded from realized closes.
- Source: `wallet-query.service.ts:87-146`.

---

## 10. Analytics Rules

### Cash flow aggregation

- `getAggregateCashFlowEffect` in `src/domain/reportingEffect.ts`:
  - INCOME → `+amount`
  - EXPENSE → `−amount`
  - TRANSFER → **0** (excluded from income/expense aggregates)
- Transfers (including debt repayments) are **never** counted as income or
  expense in aggregate reporting.

### Wallet-level reporting

- `getWalletReportingEffect` in `src/domain/reportingEffect.ts`:
  - INCOME source wallet → `+amount`
  - EXPENSE source wallet → `−amount`
  - TRANSFER source → `−amount`, TRANSFER destination → `+amount`
  - Installment expenses use `grandTotal` (not `monthlyAmount`)

### Known limitation (PM-STAB-002)

The default transaction endpoint (`GET /v1/transactions`) auto-filters to the
current reporting month. For multi-month analytics, use
`GET /v1/transactions/all` with client-side date filtering. The frontend
analytics page currently does NOT do this — period selectors "3 months" /
"6 months" are non-functional. This is a known issue, not a documentation error.

---

## 11. Installment Lifecycle (Current Implementation)

### Implemented

- **Create:** Front-loaded balance deduction (full `grandTotal` at creation).
  Status: ACTIVE. `currentTerm: 1`, `paidTerms: 0`.
- **Pay:** Manual per-term payment via `POST /v1/bills/:id/pay`.
  Term advances, status → SETTLED on final payment.
- **Cancellation:** Not yet implemented in backend. Status `CANCELLED` exists
  in schema but no endpoint transitions to it.

### Not yet implemented (PD-003 Draft)

- Automatic monthly term advancement (calendar-based lifecycle).
- Catch-up processing after downtime.
- Early payoff calculation.
- Cancellation with balance reversal.
- These are product decisions in Draft status — do not implement without
  explicit approval.

---

## 12. Admin Fee and Interest

### Interest

- Flat percentage per month: `totalInterest = round(principal × rate/100 × months)`.
- Fully implemented and included in `grandTotal`.
- Source: `computeInstallmentPlan` in `src/domain/installment.ts`.

### Admin fee

- Schema stores: `adminFee` (amount), `adminFeeType` (FLAT/PERCENT),
  `totalAdminFee`.
- **NOT included in `grandTotal` by current `computeInstallmentPlan`.**
  The `grandTotal` formula only uses principal + interest.
- This is a known gap — PD-004 (Draft) recommends including admin fee in
  `grandTotal`. The schema has the columns ready; the calculation does not
  yet use them.
- Status: **Open decision.** Do not add admin fee to grandTotal without
  approved PD-004.

---

## 13. Money Precision and Rounding

```
Scale:   2 decimal places (MONEY_SCALE = 2)
Mode:    ROUND_HALF_UP
Type:    Prisma.Decimal (Decimal(15, 2) in schema)
```

### Rules

- **All** persisted and computed money is `Prisma.Decimal`. No `number`,
  `parseFloat`, `parseInt`, or `Math.round` in services/domain code.
- Comparison: use `.equals()`, `.lessThan()`, `.greaterThan()` — never
  `===` or `<` on coerced numbers.
- `toMoney(value)` = `value.toDecimalPlaces(2, ROUND_HALF_UP)` — use this
  when rounding is needed.
- `MONEY_SCALE` and `MONEY_ROUNDING` exported from `src/domain/installment.ts`.
- Decimal → JSON number conversion happens **only** in controller serializers
  at the response boundary. See `backend-api.skill.md`.

### Common mistake

```typescript
// WRONG — float comparison loses precision
if (Number(balance) < Number(amount)) { ... }

// RIGHT — Decimal comparison
if (balance.lessThan(amount)) { ... }
```

---

## 14. Operations That Must Be Atomic

Every multi-write financial operation MUST run inside `db.$transaction(...)`:

| Operation | Writes inside transaction |
|---|---|
| Create regular transaction | 1× Transaction + 1–2× Wallet update |
| Create installment (credit expense) | 1× Installment + 1× Transaction + 2× Wallet update |
| Update transaction | Reverse old deltas + 1× Transaction update + Apply new deltas |
| Delete transaction (regular) | Reverse deltas + 1× Transaction delete |
| Delete transaction (installment) | Reverse grandTotal + 1× Transaction delete + 1× Installment delete |
| Pay installment | 1× Transaction create + 2× Wallet update + 1× Installment update |

Wallet CRUD (create/update/delete) is a single write per operation — no
`$transaction` needed outside of cascade.

---

## 15. Reconciliation

- `reconcileWalletBalances` in `src/domain/transactionBalance.ts`:
  recomputes expected balance from `initialBalance + Σ(effects)`.
- Pure, deterministic, read-only. Never mutates data.
- Script: `src/scripts/reconcile.ts --audit` — read-only audit mode.
- Never repair silently. Any write/repair requires explicit user approval.
- Reconciliation formula for each wallet:
  ```
  expected = initialBalance + Σ(computeBalanceEffect for each transaction)
  drift    = stored − expected
  ```
- Transfers are reconciled symmetrically (both sides from the same stored row).

---

## 16. Transfer Representation (PM-STAB-009A — Resolved)

All transfers use the `Transaction` model with `type: "TRANSFER"`, `walletId`
(source), and `toWalletId` (destination). The separate `Transfer` model was
removed in PM-STAB-009A (2026-07-18) — it had zero application readers or
writers across the entire codebase. PD-007 declares Transaction-with-toWalletId
as the sole canonical transfer representation.

---

## 17. Ledger Integrity

- Wallet balances change **only** through transaction/installment orchestration
  (`applyBalanceDeltas` inside `$transaction`, atomic increments).
- Direct balance overwrite via wallet update: rejected with
  `BALANCE_UPDATE_NOT_ALLOWED`. An unchanged echo is tolerated.
- `initialBalance` is the reconciliation anchor — set once at wallet creation,
  never modified.
- Delete = reverse the persisted effect (computed from stored rows, never
  from request data).

---

## 18. Quick Reference — Common Mistakes

1. **Computing net worth as assets only** — PD-001 (Approved) defines it as
   `assets − debt`. The assets-only formula is deprecated.
2. **Treating debt repayment as EXPENSE** — Debt repayment is `TRANSFER`.
   The expense already happened when the debt was created.
3. **Using `Number(amount)` or float comparison** — all money math is
   `Prisma.Decimal`. Use `.equals()`, `.lessThan()`, etc.
4. **Reversing an installment by `monthlyAmount`** — always use `grandTotal`.
5. **Building month ranges with `new Date(y, m, 1)`** — use
   `getReportingMonthRange` from `reportingTime.ts`.
6. **Assuming E-WALLET cannot pay bills** — it can. `ALLOWED_SOURCE_TYPES`
   includes `E_WALLET`.
7. **Creating INCOME against a DEBT wallet** — backend rejects this. Do not
   rely on frontend-only guards.

---

## Appendix A — Deprecated Decisions

### Net Worth = Assets Only (July 2026, superseded)

A previous product decision defined `netWorth = Σ(ASSET balances)`, excluding
debt. This was implemented in an earlier version of `calculateNetWorth` and
documented in previous versions of this skill file.

**Superseded by:** PD-001 (Approved 2026-07-14) — Option C (Separate Net Worth
and Total Assets), defining `netWorth = totalAset − totalUtang`.

**Migration:** Backend `calculateNetWorth`, `dashboardQueryService`, and
`walletQueryService.getNetWorth` were updated to implement PD-001.
Tests (`dashboardQueryService.test.ts`) explicitly assert the new formula.

**Frontend:** The dashboard page still computes net worth as assets only
(PM-STAB-001, Critical). This is a known bug, not a valid product decision.

---

## Appendix B — Implementation References

| Concern | Primary file |
|---|---|
| Wallet classification | `src/utils/financial.ts` (classifyWalletForNetWorth, calculateNetWorth) |
| Transaction balance effects | `src/domain/transactionBalance.ts` (computeBalanceEffect, reverseBalanceEffect, applyBalanceDeltas) |
| Reporting effects | `src/domain/reportingEffect.ts` (getWalletReportingEffect, getAggregateCashFlowEffect) |
| Installment math | `src/domain/installment.ts` (computeInstallmentPlan, computeFinalMonthlyAmount, toMoney) |
| Reporting time | `src/domain/reportingTime.ts` (getReportingMonthRange, parseBusinessDate, etc.) |
| Billing cycle | `src/domain/billingCycle.ts` (calculateFirstDueDate, addBillingMonth) |
| Reconciliation | `src/domain/reconciliation.ts` (auditWalletBalances) |
| Transaction service | `src/services/transaction.service.ts` |
| Installment payment service | `src/services/installment-payment.service.ts` |
| Dashboard query service | `src/services/dashboard-query.service.ts` |
| Wallet query service | `src/services/wallet-query.service.ts` |
| Wallet command service | `src/services/wallet.service.ts` |
| Prisma schema | `prisma/schema.prisma` |

---

## Appendix C — Open Product Decisions

| Decision | Status | Impact on this document |
|---|---|---|
| PD-003 (Installment Lifecycle) | Draft | Auto-advancement, catch-up, cancellation not yet implemented |
| PD-004 (Installment Fees) | Draft | Admin fee not included in grandTotal calculation |
| PD-005 (Debt Utilization) | Draft | 30%/80% thresholds; strict credit limit enforcement |
| PD-006 (Reporting Surface) | Draft | Dedicated reports surface vs. dashboard-only reporting |
| PD-007 (Transfer Representation) | Draft | Retire unused Transfer model |
| PD-008 (Design Language) | Draft | Visual token contract |

When any of these moves to Approved, this document must be updated.
