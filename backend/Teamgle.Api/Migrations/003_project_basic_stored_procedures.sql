-- Migration 003: Move ProjectRepository project/event/schedule/shift basics into stored procedures.
-- Run once against the target DB before deploying the matching backend build.

CREATE OR ALTER PROCEDURE sp_GetManagerUserIdByFbUid
    @fbuid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT u.user_ID
    FROM [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE u.FBUID = @fbuid;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateProject
    @projId NVARCHAR(64),
    @name NVARCHAR(255),
    @startDate DATETIME2 = NULL,
    @endDate DATETIME2 = NULL,
    @status NVARCHAR(50),
    @customerId NVARCHAR(64) = NULL,
    @companyId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    IF @customerId IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM Customer
            WHERE customer_ID = @customerId
              AND company_ID = @companyId
       )
    BEGIN
        RAISERROR('Customer not found or does not belong to your company.', 16, 1);
        RETURN;
    END

    INSERT INTO Project
        (Proj_ID, name, start_date, end_date, status, customer_ID)
    VALUES
        (@projId, @name, @startDate, @endDate, @status, @customerId);
END
GO

CREATE OR ALTER PROCEDURE sp_CreateManagerProject
    @managerUserId NVARCHAR(64),
    @projectId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO Manager_Project
        (manager_user_ID, project_ID, is_owner, joined_at)
    VALUES
        (@managerUserId, @projectId, 1, GETDATE());
END
GO

CREATE OR ALTER PROCEDURE sp_CreateEvent
    @eventId NVARCHAR(64),
    @name NVARCHAR(255),
    @location NVARCHAR(255) = NULL,
    @startTime DATETIME2,
    @endTime DATETIME2,
    @projectId NVARCHAR(64),
    @attendeesCount INT = NULL,
    @eventType NVARCHAR(100),
    @plannedBudget DECIMAL(18,2) = NULL,
    @expectedRevenue DECIMAL(18,2) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO [Event]
        (event_ID, name, location, start_time, end_time,
         project_ID, status, attendees_count, event_type,
         planned_budget, expected_revenue)
    VALUES
        (@eventId, @name, @location, @startTime, @endTime,
         @projectId, 'planning', @attendeesCount, @eventType,
         @plannedBudget, @expectedRevenue);
END
GO

CREATE OR ALTER PROCEDURE sp_GetProjectsByManager
    @firebaseUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.Proj_ID                                   AS ProjId,
        p.name                                      AS Name,
        p.start_date                                AS StartDate,
        p.end_date                                  AS EndDate,
        p.status                                    AS Status,
        p.customer_ID                               AS CustomerId,
        c.customer_company_name                     AS CustomerName,
        COUNT(DISTINCT e.event_ID)                  AS EventCount,
        ISNULL(SUM(ISNULL(ss.RequiredCount, 0)), 0) AS RequiredCount,
        ISNULL(SUM(ISNULL(ss.StaffedCount, 0)), 0)  AS StaffedCount
    FROM Project p
    LEFT JOIN Customer c ON p.customer_ID = c.customer_ID
    LEFT JOIN [Event] e ON e.project_ID = p.Proj_ID
    LEFT JOIN (
        SELECT s.event_ID,
               SUM(s.required_quantity) AS RequiredCount,
               SUM(CASE
                       WHEN ec.cnt IS NULL OR ec.cnt = 0 THEN 0
                       WHEN ec.cnt >= s.required_quantity THEN s.required_quantity
                       ELSE ec.cnt
                   END) AS StaffedCount
        FROM Shift s
        LEFT JOIN (
            SELECT shift_ID, COUNT(DISTINCT employee_user_ID) AS cnt
            FROM Employee_Shift
            WHERE status IN ('approved', 'manager_approved')
              AND (canceled IS NULL OR canceled = 0)
            GROUP BY shift_ID
        ) ec ON ec.shift_ID = s.Shift_ID
        GROUP BY s.event_ID
    ) ss ON ss.event_ID = e.event_ID
    WHERE p.Proj_ID IN (
        SELECT mp.project_ID
        FROM Manager_Project mp
        INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
        WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @firebaseUid)
    )
    GROUP BY
        p.Proj_ID, p.name, p.start_date, p.end_date,
        p.status, p.customer_ID, c.customer_company_name
    ORDER BY p.start_date DESC;
END
GO

CREATE OR ALTER PROCEDURE sp_GetProjectDetailHeader
    @projId NVARCHAR(64),
    @firebaseUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        p.Proj_ID               AS ProjId,
        p.name                  AS Name,
        p.start_date            AS StartDate,
        p.end_date              AS EndDate,
        p.status                AS Status,
        p.customer_ID           AS CustomerId,
        c.customer_company_name AS CustomerName
    FROM Project p
    LEFT JOIN Customer c ON c.customer_ID = p.customer_ID
    WHERE p.Proj_ID = @projId
      AND p.Proj_ID IN (
          SELECT mp.project_ID
          FROM Manager_Project mp
          INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
          WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @firebaseUid)
      );
END
GO

CREATE OR ALTER PROCEDURE sp_GetProjectDetailEvents
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        e.event_ID         AS EventId,
        e.name             AS Name,
        e.location         AS Location,
        e.start_time       AS StartTime,
        e.end_time         AS EndTime,
        e.status           AS Status,
        e.event_type       AS EventType,
        e.planned_budget   AS PlannedBudget,
        e.expected_revenue AS ExpectedRevenue
    FROM [Event] e
    WHERE e.project_ID = @projId
    ORDER BY e.start_time;
END
GO

CREATE OR ALTER PROCEDURE sp_GetProjectScheduleHeader
    @projId NVARCHAR(64),
    @firebaseUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT p.Proj_ID AS ProjId, p.name AS Name
    FROM Project p
    WHERE p.Proj_ID = @projId
      AND p.Proj_ID IN (
          SELECT mp.project_ID
          FROM Manager_Project mp
          INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
          WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @firebaseUid)
      );
END
GO

CREATE OR ALTER PROCEDURE sp_GetProjectScheduleItems
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        e.event_ID          AS EventId,
        e.name              AS EventName,
        e.start_time        AS EventStart,
        e.end_time          AS EventEnd,
        e.location          AS EventLocation,
        s.Shift_ID          AS ShiftId,
        s.roll_ID           AS RoleId,
        r.Roll_name         AS RoleName,
        s.required_quantity AS RequiredQuantity,
        s.start_time        AS ShiftStart,
        s.end_time          AS ShiftEnd,
        COUNT(DISTINCT CASE
            WHEN es.status IN ('approved', 'manager_approved')
             AND (es.canceled IS NULL OR es.canceled = 0)
            THEN es.employee_user_ID
        END)                AS StaffedCount
    FROM [Event] e
    LEFT JOIN Shift s ON s.event_ID = e.event_ID
    LEFT JOIN Roll r ON r.Roll_ID = s.roll_ID
    LEFT JOIN Employee_Shift es ON es.shift_ID = s.Shift_ID
    WHERE e.project_ID = @projId
    GROUP BY
        e.event_ID, e.name, e.start_time, e.end_time, e.location,
        s.Shift_ID, s.roll_ID, r.Roll_name, s.required_quantity, s.start_time, s.end_time
    ORDER BY e.start_time, s.start_time;
END
GO

CREATE OR ALTER PROCEDURE sp_UpdateShift
    @shiftId NVARCHAR(64),
    @firebaseUid NVARCHAR(256),
    @rollId NVARCHAR(64),
    @requiredQuantity INT,
    @startTime DATETIME2,
    @endTime DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    -- Block if approved employee count exceeds the new required quantity
    DECLARE @approvedCount INT;
    SELECT @approvedCount = COUNT(*)
    FROM Employee_Shift
    WHERE shift_ID = @shiftId
      AND status = 'manager_approved'
      AND ISNULL(canceled, 0) = 0;

    IF @approvedCount > @requiredQuantity
        RAISERROR('APPROVED_EXCEEDS_REQUIRED:%d:%d', 16, 1, @approvedCount, @requiredQuantity);

    UPDATE Shift
    SET roll_ID = @rollId,
        required_quantity = @requiredQuantity,
        start_time = @startTime,
        end_time = @endTime
    WHERE Shift_ID = @shiftId
      AND Shift_ID IN (
          SELECT s.Shift_ID
          FROM Shift s
          INNER JOIN [Event] e ON e.event_ID = s.event_ID
          INNER JOIN Project p ON p.Proj_ID = e.project_ID
          WHERE s.Shift_ID = @shiftId
            AND p.Proj_ID IN (
                SELECT mp.project_ID
                FROM Manager_Project mp
                INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
                WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @firebaseUid)
            )
      );

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_DeleteShift
    @shiftId NVARCHAR(64),
    @firebaseUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM Shift
    WHERE Shift_ID = @shiftId
      AND Shift_ID IN (
          SELECT s.Shift_ID
          FROM Shift s
          INNER JOIN [Event] e ON e.event_ID = s.event_ID
          INNER JOIN Project p ON p.Proj_ID = e.project_ID
          WHERE s.Shift_ID = @shiftId
            AND p.Proj_ID IN (
                SELECT mp.project_ID
                FROM Manager_Project mp
                INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
                WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @firebaseUid)
            )
      );

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateEventShift
    @shiftId NVARCHAR(64),
    @eventId NVARCHAR(64),
    @firebaseUid NVARCHAR(256),
    @rollId NVARCHAR(64),
    @requiredQuantity INT,
    @startTime DATETIME2,
    @endTime DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM [Event] e
        INNER JOIN Project p ON p.Proj_ID = e.project_ID
        WHERE e.event_ID = @eventId
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

    INSERT INTO Shift
        (Shift_ID, event_ID, roll_ID, required_quantity, start_time, end_time)
    VALUES
        (@shiftId, @eventId, @rollId, @requiredQuantity, @startTime, @endTime);

    SELECT 1 AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateShift
    @shiftId NVARCHAR(64),
    @eventId NVARCHAR(64),
    @rollId NVARCHAR(64),
    @requiredQuantity INT,
    @startTime DATETIME2,
    @endTime DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO Shift
        (Shift_ID, event_ID, roll_ID, required_quantity, start_time, end_time)
    VALUES
        (@shiftId, @eventId, @rollId, @requiredQuantity, @startTime, @endTime);
END
GO

CREATE OR ALTER PROCEDURE sp_CheckProjectAccess
    @projId NVARCHAR(64),
    @fbUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM Project WHERE Proj_ID = @projId)
    BEGIN
        SELECT 0 AS AccessResult;
        RETURN;
    END

    IF NOT EXISTS (
        SELECT 1
        FROM Manager_Project mp
        INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
        WHERE mp.project_ID = @projId
          AND mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @fbUid)
    )
    BEGIN
        SELECT 2 AS AccessResult;
        RETURN;
    END

    SELECT 1 AS AccessResult;
END
GO
