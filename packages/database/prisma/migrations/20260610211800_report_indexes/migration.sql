-- Report/consolidated index support (Round 4).
-- Adds a single-column index on `date` to TimeEntry and Expense so the global
-- admin/finance consolidated report (month range across ALL consultants and
-- projects, without fixing consultantId/projectId) uses a range scan instead
-- of a sequential scan. The existing composite indexes all lead with
-- consultantId/projectId/status, which do not serve a pure date-range filter.
-- Cheap write cost (one B-tree each); no data is rewritten or backfilled.

-- CreateIndex
CREATE INDEX "TimeEntry_date_idx" ON "TimeEntry"("date");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
