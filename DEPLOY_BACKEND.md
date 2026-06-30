# Backend Deployment Guide (Google Apps Script) — Cashflow / Warehouse / Expenses update

This update is **additive and backward-compatible**. It does not rename, reorder, or delete any
existing sheet column or function. New columns are appended at the end of existing sheets
automatically. If you deploy this and do nothing else, the old app keeps working; the new
features light up once the new `Code.gs` is live.

## What changed in `backend/Code.gs`
- New helper `ensureColumns()` + `migrateSchemaV2()` — safely append new columns:
  - `Invoices` → `Payment_Date`
  - `Delivery_Orders` → `Payment_Date`
  - `Ecommerce_Sales` → `Net_Revenue`, `Warehouse_Type`
- `getDashboardData()` — now defaults to month-to-date, returns a 12-month `cashflow`
  (income vs expense) series, current-month `totalIncome`, and 3-way stock split
  (offline / online / clinic).
- New action `getEcommerceOrderIds` — lets the CSV importer skip already-imported lines
  (safe re-uploads).
- `bulkAddInventoryOut()` — records `Net_Revenue` + `Warehouse_Type` on each sale.
- `addInventoryOut()` — Clinic stock is protected from going negative (like Offline);
  Online still allows negatives for the opname flow.
- New warehouse constant `Clinic (Express)` (just a string value in `Warehouse_Type`).

## How to deploy safely (keeps the same Web App URL)

1. **Back up first.** In the Apps Script editor, open `Code.gs`, select all, copy it into a
   local file named `Code.backup.gs`. (Rollback = paste this back.)
2. **Paste the new code.** Replace the entire `Code.gs` contents with the new
   `backend/Code.gs` from this repo. Click **Save** (disk icon).
3. **(Optional) Run the migration once.** In the editor's function dropdown choose
   `migrateSchemaV2`, click **Run**, approve permissions if asked. This adds the new columns
   immediately. (If you skip this, it runs automatically the first time the dashboard loads.)
4. **Re-deploy as a NEW VERSION of the SAME deployment** (so the URL in `js/app.js` doesn't
   change):
   - **Deploy ▾ → Manage deployments**
   - Click the ✏️ (edit) on your existing **Web app** deployment
   - **Version → New version**
   - Keep **Execute as: Me**, **Who has access: Anyone**
   - **Deploy**
   - Do **not** use "New deployment" — that creates a different URL and would require editing
     `API_URL` in `js/app.js`.
5. **Smoke test.** Open the app, log in, load the Dashboard. Confirm it loads with no errors
   and the expense figure now reflects the current month.

## Re-uploading historical CSVs (your cutover rule)

After deploy, re-upload your past Shopee exports (Inventory → Stock Out → CSV Upload):
- Orders **before 25 Jun 2026** → recorded for **revenue + qty only** (no stock deduction).
- Orders **on/after 25 Jun 2026** → recorded **and** deduct stock (Online or Clinic by courier).
- Cancelled ("Batal") orders are skipped. Already-imported lines are skipped automatically, so
  re-uploading the same file twice is safe.

The preview shows `Deduct: X Pcs, Total Sales: Y Pcs` before you confirm — review it each time.

## Stocking the Clinic (Express) warehouse

Clinic starts empty. Move stock into it via **Inventory → Move Stock** (From: Offline/Online →
To: Clinic (Express)). It can also receive goods directly via **Stock In**. Same-day / GoSend /
GrabExpress / Instant online orders deduct from Clinic; all other couriers deduct from Online.

## Rollback
Paste `Code.backup.gs` back into `Code.gs`, Save, and re-deploy a new version. The extra columns
that were added are harmless and can stay (nothing reads them in the old code).
