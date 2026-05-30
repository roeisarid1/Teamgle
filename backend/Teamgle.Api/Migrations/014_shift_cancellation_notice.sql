-- Migration 014: Shift cancellation notices — write to DB when a shift is deleted
-- so approved employees see a cancellation card in their Updates tab.
-- Run once against the target DB before deploying the matching backend build.

-- ── Shift_Cancellation_Notice table ──────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Shift_Cancellation_Notice')
BEGIN
    CREATE TABLE Shift_Cancellation_Notice (
        notice_ID        NVARCHAR(64)  NOT NULL PRIMARY KEY,
        employee_user_ID NVARCHAR(50)  NOT NULL,
        event_name       NVARCHAR(255) NULL,
        role_name        NVARCHAR(255) NULL,
        shift_start      DATETIME2     NULL,
        shift_end        DATETIME2     NULL,
        event_start      DATETIME2     NULL,
        cancelled_at     DATETIME2     NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT FK_ShiftCancellationNotice_User
            FOREIGN KEY (employee_user_ID) REFERENCES [User](user_ID)
    );
END
GO

-- ── sp_GetCancellationNoticesForEmployee ──────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_GetCancellationNoticesForEmployee
    @fbUid NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @userId NVARCHAR(50);
    SELECT @userId = user_ID FROM [User] WHERE FBUID = @fbUid;
    IF @userId IS NULL RETURN;

    SELECT notice_ID   AS NoticeId,
           event_name  AS EventName,
           role_name   AS RoleName,
           shift_start AS ShiftStart,
           shift_end   AS ShiftEnd,
           event_start AS EventStart,
           cancelled_at AS CancelledAt
    FROM Shift_Cancellation_Notice
    WHERE employee_user_ID = @userId
    ORDER BY cancelled_at DESC;
END
GO

-- ── sp_DeleteShift — cascade + cancellation notices ───────────────────────────
CREATE OR ALTER PROCEDURE sp_DeleteShift
    @shiftId     NVARCHAR(64),
    @firebaseUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1 FROM Shift s
        INNER JOIN [Event] e  ON e.event_ID = s.event_ID
        INNER JOIN Project p  ON p.Proj_ID  = e.project_ID
        WHERE s.Shift_ID = @shiftId
          AND p.Proj_ID IN (
              SELECT mp.project_ID
              FROM Manager_Project mp
              INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
              WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @firebaseUid)
          )
    )
    BEGIN
        SELECT 0 AS RowsAffected;
        RETURN;
    END

    DECLARE @roleName   NVARCHAR(255);
    DECLARE @shiftStart DATETIME2;
    DECLARE @shiftEnd   DATETIME2;
    DECLARE @eventName  NVARCHAR(255);
    DECLARE @eventStart DATETIME2;

    SELECT @roleName   = r.Roll_name,
           @shiftStart = s.start_time,
           @shiftEnd   = s.end_time,
           @eventName  = e.name,
           @eventStart = e.start_time
    FROM Shift s
    INNER JOIN [Event] e ON e.event_ID = s.event_ID
    LEFT JOIN Roll r     ON r.Roll_ID  = s.roll_ID
    WHERE s.Shift_ID = @shiftId;

    INSERT INTO Shift_Cancellation_Notice
           (notice_ID, employee_user_ID, event_name, role_name, shift_start, shift_end, event_start, cancelled_at)
    SELECT NEWID(),
           es.employee_user_ID,
           @eventName,
           @roleName,
           @shiftStart,
           @shiftEnd,
           @eventStart,
           GETUTCDATE()
    FROM Employee_Shift es
    WHERE es.shift_ID = @shiftId
      AND es.status   = 'manager_approved'
      AND (es.canceled IS NULL OR es.canceled = 0);

    DELETE FROM Shift_Equipment WHERE shift_ID = @shiftId;

    DELETE FROM Brief_Acknowledgment
    WHERE brief_ID IN (SELECT brief_ID FROM Brief WHERE shift_ID = @shiftId);
    DELETE FROM Brief WHERE shift_ID = @shiftId;

    DELETE FROM Task WHERE shift_ID = @shiftId;
    DELETE FROM Employee_Shift WHERE shift_ID = @shiftId;
    DELETE FROM Shift WHERE Shift_ID = @shiftId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

-- ── sp_DeleteProject — cancellation notices + Shift_Equipment cascade ─────────
CREATE OR ALTER PROCEDURE sp_DeleteProject
    @projId       NVARCHAR(50),
    @managerFBUID NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM [User] u INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE u.FBUID = @managerFBUID;

    IF @companyId IS NULL BEGIN
        RAISERROR('User is not a registered manager.', 16, 1); RETURN;
    END

    IF NOT EXISTS (
        SELECT 1 FROM Manager_Project mp
        INNER JOIN [User] u ON u.user_ID = mp.manager_user_ID
        WHERE mp.project_ID = @projId AND u.company_ID = @companyId
    ) BEGIN
        RAISERROR('Project not found or access denied.', 16, 2); RETURN;
    END

    BEGIN TRANSACTION;
    BEGIN TRY
        UPDATE Invoice SET project_ID = NULL WHERE project_ID = @projId;
        UPDATE Invoice SET event_ID   = NULL
        WHERE event_ID IN (SELECT event_ID FROM [Event] WHERE project_ID = @projId);

        UPDATE Brief SET shift_ID = NULL
        WHERE shift_ID IN (
            SELECT s.Shift_ID FROM Shift s
            INNER JOIN [Event] e ON s.event_ID = e.event_ID
            WHERE e.project_ID = @projId
        );
        UPDATE Task SET shift_ID = NULL
        WHERE shift_ID IN (
            SELECT s.Shift_ID FROM Shift s
            INNER JOIN [Event] e ON s.event_ID = e.event_ID
            WHERE e.project_ID = @projId
        );

        -- Cancellation notices for approved employees
        INSERT INTO Shift_Cancellation_Notice
               (notice_ID, employee_user_ID, event_name, role_name,
                shift_start, shift_end, event_start, cancelled_at)
        SELECT NEWID(),
               es.employee_user_ID,
               ev.name,
               r.Roll_name,
               s.start_time,
               s.end_time,
               ev.start_time,
               GETUTCDATE()
        FROM Employee_Shift es
        INNER JOIN Shift s    ON s.Shift_ID   = es.shift_ID
        INNER JOIN [Event] ev ON ev.event_ID  = s.event_ID
        LEFT  JOIN Roll r     ON r.Roll_ID    = s.roll_ID
        WHERE ev.project_ID = @projId
          AND es.status     = 'manager_approved'
          AND (es.canceled IS NULL OR es.canceled = 0);

        DELETE ba FROM Brief_Acknowledgment ba
        INNER JOIN Brief b ON ba.brief_ID = b.brief_ID
        INNER JOIN [Event] e ON b.event_ID = e.event_ID
        WHERE e.project_ID = @projId;

        DELETE ba FROM Brief_Acknowledgment ba
        INNER JOIN Brief b ON ba.brief_ID = b.brief_ID
        WHERE b.project_ID = @projId;

        DELETE es FROM Employee_Shift es
        INNER JOIN Shift s ON es.shift_ID = s.Shift_ID
        INNER JOIN [Event] e ON s.event_ID = e.event_ID
        WHERE e.project_ID = @projId;

        DELETE se FROM Shift_Equipment se
        INNER JOIN Shift s ON se.shift_ID = s.Shift_ID
        INNER JOIN [Event] e ON s.event_ID = e.event_ID
        WHERE e.project_ID = @projId;

        DELETE ee FROM Event_Expense ee
        INNER JOIN [Event] e ON ee.event_ID = e.event_ID
        WHERE e.project_ID = @projId;

        DELETE t FROM Task t
        INNER JOIN [Event] e ON t.event_ID = e.event_ID
        WHERE e.project_ID = @projId;
        DELETE FROM Task WHERE project_ID = @projId;

        DELETE b FROM Brief b
        INNER JOIN [Event] e ON b.event_ID = e.event_ID
        WHERE e.project_ID = @projId;
        DELETE FROM Brief WHERE project_ID = @projId;

        DELETE s FROM Shift s
        INNER JOIN [Event] e ON s.event_ID = e.event_ID
        WHERE e.project_ID = @projId;

        DELETE FROM [Event] WHERE project_ID = @projId;
        DELETE FROM Manager_Project WHERE project_ID = @projId;
        DELETE FROM Project WHERE Proj_ID = @projId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO
