-- Migration 001: Add shift-level bulk hours and per-employee manager override columns
-- Run once against igroup34_prod (or any environment DB) before deploying the matching
-- backend build that uses these columns.

-- ── Shift: shift-level default hours set by the manager ──────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'Shift') AND name = N'bulk_actual_start_time'
)
    ALTER TABLE Shift ADD bulk_actual_start_time DATETIME2 NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'Shift') AND name = N'bulk_actual_end_time'
)
    ALTER TABLE Shift ADD bulk_actual_end_time DATETIME2 NULL;

-- ── Employee_Shift: per-employee manager override ─────────────────────────────
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'Employee_Shift') AND name = N'manager_actual_start_time'
)
    ALTER TABLE Employee_Shift ADD manager_actual_start_time DATETIME2 NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'Employee_Shift') AND name = N'manager_actual_end_time'
)
    ALTER TABLE Employee_Shift ADD manager_actual_end_time DATETIME2 NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'Employee_Shift') AND name = N'is_manager_hours_override'
)
    ALTER TABLE Employee_Shift ADD is_manager_hours_override BIT NOT NULL DEFAULT 0;
