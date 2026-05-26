-- Event-first stored procedures
-- Run each CREATE OR ALTER PROCEDURE batch separately if your SQL tool does not support GO.

CREATE OR ALTER PROCEDURE sp_GetEventsByManager
    @firebaseUid NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        e.event_ID AS EventId,
        e.name AS Name,
        e.start_time AS StartTime,
        e.end_time AS EndTime,
        e.status AS Status,
        e.event_type AS EventType,
        e.location AS Location,
        e.planned_budget AS PlannedBudget,
        e.expected_revenue AS ExpectedRevenue,
        e.attendees_count AS AttendeesCount,
        p.customer_ID AS CustomerId,
        c.customer_company_name AS CustomerName,
        ISNULL(ss.RequiredCount, 0) AS RequiredCount,
        ISNULL(ss.StaffedCount, 0) AS StaffedCount
    FROM Event e
    INNER JOIN Project p ON p.Proj_ID = e.project_ID
    LEFT JOIN Customer c ON c.customer_ID = p.customer_ID
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
    ORDER BY e.start_time DESC;
END
GO

CREATE OR ALTER PROCEDURE sp_GetEventScheduleById
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        e.event_ID AS EventId,
        e.name AS EventName,
        e.start_time AS EventStart,
        e.end_time AS EventEnd,
        e.location AS EventLocation,
        s.Shift_ID AS ShiftId,
        s.roll_ID AS RoleId,
        r.Roll_name AS RoleName,
        s.required_quantity AS RequiredQuantity,
        s.start_time AS ShiftStart,
        s.end_time AS ShiftEnd,
        COUNT(DISTINCT CASE
            WHEN es.status IN ('approved', 'manager_approved')
             AND (es.canceled IS NULL OR es.canceled = 0)
            THEN es.employee_user_ID
        END) AS StaffedCount
    FROM Event e
    LEFT JOIN Shift s ON s.event_ID = e.event_ID
    LEFT JOIN Roll r ON r.Roll_ID = s.roll_ID
    LEFT JOIN Employee_Shift es ON es.shift_ID = s.Shift_ID
    WHERE e.event_ID = @eventId
    GROUP BY
        e.event_ID, e.name, e.start_time, e.end_time, e.location,
        s.Shift_ID, s.roll_ID, r.Roll_name, s.required_quantity, s.start_time, s.end_time
    ORDER BY s.start_time;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateStandaloneEvent
    @projId          NVARCHAR(64),
    @eventId         NVARCHAR(64),
    @companyId       NVARCHAR(64),
    @managerId       NVARCHAR(64),
    @name            NVARCHAR(255),
    @location        NVARCHAR(255) = NULL,
    @startTime       DATETIME2,
    @endTime         DATETIME2,
    @status          NVARCHAR(50),
    @attendeesCount  INT = NULL,
    @eventType       NVARCHAR(100),
    @plannedBudget   DECIMAL(18, 2) = NULL,
    @expectedRevenue DECIMAL(18, 2) = NULL,
    @customerId      NVARCHAR(64) = NULL,
    @shiftsJson      NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @customerId IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM Customer
           WHERE customer_ID = @customerId
             AND company_ID = @companyId
       )
    BEGIN
        THROW 51010, 'Customer not found or does not belong to your company.', 1;
    END

    BEGIN TRANSACTION;

    INSERT INTO Project (Proj_ID, name, start_date, end_date, status, customer_ID)
    VALUES (@projId, @name, CAST(@startTime AS date), CAST(@endTime AS date), 'planning', @customerId);

    INSERT INTO Manager_Project (manager_user_ID, project_ID, is_owner, joined_at)
    VALUES (@managerId, @projId, 1, GETDATE());

    INSERT INTO Event
        (event_ID, name, location, start_time, end_time,
         project_ID, status, attendees_count, event_type,
         planned_budget, expected_revenue)
    VALUES
        (@eventId, @name, @location, @startTime, @endTime,
         @projId, @status, @attendeesCount, @eventType,
         @plannedBudget, @expectedRevenue);

    INSERT INTO Shift (Shift_ID, event_ID, roll_ID, required_quantity, start_time, end_time)
    SELECT NEWID(), @eventId, RollId, RequiredQuantity, StartTime, EndTime
    FROM OPENJSON(@shiftsJson)
    WITH (
        RollId NVARCHAR(64) '$.RollId',
        RequiredQuantity INT '$.RequiredQuantity',
        StartTime DATETIME2 '$.StartTime',
        EndTime DATETIME2 '$.EndTime'
    );

    COMMIT TRANSACTION;
END
GO
