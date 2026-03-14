-- ═══════════════════════════════════════════════════════════════════════════
-- Stored Procedures for Project / Event / Shift creation
-- Run this script once against the Teamgle database.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── sp_CreateProject ───────────────────────────────────────────────────────
-- Inserts a new row into Projects and returns the generated Proj_ID.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_CreateProject
    @name       NVARCHAR(200),
    @startDate  DATE,
    @endDate    DATE,
    @customerId NVARCHAR(36)  = NULL,
    @companyId  NVARCHAR(36),
    @projId     NVARCHAR(36)  OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @projId = NEWID();

    INSERT INTO Projects
        (Proj_ID, proj_name, start_date, end_date, status, customer_ID, company_ID, created_at)
    VALUES
        (@projId, @name, @startDate, @endDate, 'Draft', @customerId, @companyId, GETDATE());
END;
GO


-- ── sp_CreateManagerProject ────────────────────────────────────────────────
-- Links a manager to a project as owner in Manager_Project.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_CreateManagerProject
    @projId NVARCHAR(36),
    @userId NVARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO Manager_Project
        (Proj_ID, user_ID, is_owner, joined_at)
    VALUES
        (@projId, @userId, 1, GETDATE());
END;
GO


-- ── sp_CreateEvent ─────────────────────────────────────────────────────────
-- Inserts a new row into Events and returns the generated event_ID.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_CreateEvent
    @projId          NVARCHAR(36),
    @name            NVARCHAR(200),
    @startTime       DATETIME,
    @endTime         DATETIME,
    @location        NVARCHAR(300) = NULL,
    @attendeesCount  INT           = NULL,
    @eventType       NVARCHAR(50)  = NULL,
    @plannedBudget   DECIMAL(18,2) = NULL,
    @expectedRevenue DECIMAL(18,2) = NULL,
    @eventId         NVARCHAR(36)  OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET @eventId = NEWID();

    INSERT INTO Events
        (event_ID, Proj_ID, event_name, start_time, end_time,
         location, attendees_count, event_type,
         planned_budget, expected_revenue, created_at)
    VALUES
        (@eventId, @projId, @name, @startTime, @endTime,
         @location, @attendeesCount, @eventType,
         @plannedBudget, @expectedRevenue, GETDATE());
END;
GO


-- ── sp_CreateShift ─────────────────────────────────────────────────────────
-- Inserts a new row into Shifts.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_CreateShift
    @eventId          NVARCHAR(36),
    @rollId           NVARCHAR(36),
    @requiredQuantity INT,
    @startTime        TIME,
    @endTime          TIME
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO Shifts
        (Shift_ID, event_ID, Roll_ID, required_quantity, start_time, end_time, created_at)
    VALUES
        (NEWID(), @eventId, @rollId, @requiredQuantity, @startTime, @endTime, GETDATE());
END;
GO
