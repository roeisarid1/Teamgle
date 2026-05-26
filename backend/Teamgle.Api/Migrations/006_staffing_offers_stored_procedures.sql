-- Staffing offer stored procedures
-- Run each CREATE OR ALTER PROCEDURE batch separately if your SQL tool does not support GO.

CREATE OR ALTER PROCEDURE sp_EventBelongsToProject
    @eventId NVARCHAR(64),
    @projId  NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM Event
        WHERE event_ID = @eventId
          AND project_ID = @projId
    ) THEN 1 ELSE 0 END AS ExistsFlag;
END
GO

CREATE OR ALTER PROCEDURE sp_GetPotentialWorkers
    @eventId   NVARCHAR(64),
    @companyId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        u.user_ID,
        u.FBUID,
        u.firstName,
        u.lastName,
        emp.cost_per_hour,
        s.Shift_ID,
        s.roll_ID,
        r.Roll_name,
        s.start_time,
        s.end_time,
        s.required_quantity,
        (
            SELECT COUNT(*)
            FROM Employee_Shift es2
            WHERE es2.shift_ID = s.Shift_ID
              AND es2.status IN (
                  'manager_offer_sent', 'employee_request',
                  'manager_hold', 'manager_approved'
              )
        ) AS ActiveAssignments
    FROM [User] u
    INNER JOIN Employee emp      ON emp.user_ID = u.user_ID
    INNER JOIN Employee_Roll er  ON er.employee_user_ID = u.user_ID
    INNER JOIN Shift s           ON s.roll_ID = er.roll_ID
                                AND s.event_ID = @eventId
    INNER JOIN Roll r            ON r.Roll_ID = s.roll_ID
    WHERE u.company_ID = @companyId
      AND u.FBUID IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM Employee_Shift es
          WHERE es.shift_ID = s.Shift_ID
            AND es.employee_user_ID = er.employee_user_ID
            AND es.status IN (
                'manager_offer_sent', 'employee_request',
                'manager_hold', 'manager_approved',
                'employee_request_canceled'
            )
      )
      AND NOT EXISTS (
          SELECT 1
          FROM Employee_Shift es
          INNER JOIN Shift s2 ON s2.Shift_ID = es.shift_ID
          WHERE es.employee_user_ID = er.employee_user_ID
            AND s2.event_ID = @eventId
            AND es.status = 'manager_approved'
            AND s2.start_time < s.end_time
            AND s2.end_time > s.start_time
      )
    ORDER BY u.lastName, u.firstName, s.start_time;
END
GO

CREATE OR ALTER PROCEDURE sp_SendOfferToEmployee
    @projId         NVARCHAR(64),
    @eventId        NVARCHAR(64),
    @employeeFbUid  NVARCHAR(255),
    @managerFbUid   NVARCHAR(255),
    @shiftIdsCsv    NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM Event
        WHERE event_ID = @eventId
          AND project_ID = @projId
    )
    BEGIN
        THROW 51001, 'Event not found.', 1;
    END

    DECLARE @employeeUserId NVARCHAR(64);

    SELECT @employeeUserId = eu.user_ID
    FROM [User] eu
    INNER JOIN Employee e ON e.user_ID = eu.user_ID
    WHERE eu.FBUID = @employeeFbUid
      AND eu.company_ID = (
          SELECT company_ID
          FROM [User]
          WHERE FBUID = @managerFbUid
      );

    IF @employeeUserId IS NULL
    BEGIN
        THROW 51002, 'Employee not found or not in your company.', 1;
    END

    DECLARE @shiftIds TABLE (Shift_ID NVARCHAR(64) PRIMARY KEY);

    INSERT INTO @shiftIds (Shift_ID)
    SELECT DISTINCT LTRIM(RTRIM(value))
    FROM STRING_SPLIT(@shiftIdsCsv, ',')
    WHERE LTRIM(RTRIM(value)) <> '';

    DECLARE @requestedCount INT = (SELECT COUNT(*) FROM @shiftIds);

    IF (
        SELECT COUNT(*)
        FROM Shift s
        INNER JOIN @shiftIds ids ON ids.Shift_ID = s.Shift_ID
        WHERE s.event_ID = @eventId
    ) <> @requestedCount
    BEGIN
        THROW 51003, 'One or more shift IDs do not belong to this event.', 1;
    END

    BEGIN TRANSACTION;

    INSERT INTO Employee_Shift (shift_ID, employee_user_ID, status, status_updated_at, payment_status)
    SELECT ids.Shift_ID, @employeeUserId, 'manager_offer_sent', GETUTCDATE(), 'pending'
    FROM @shiftIds ids
    WHERE NOT EXISTS (
        SELECT 1
        FROM Employee_Shift es
        WHERE es.shift_ID = ids.Shift_ID
          AND es.employee_user_ID = @employeeUserId
          AND es.status IN (
              'manager_offer_sent', 'employee_request',
              'manager_hold', 'manager_approved'
          )
    );

    COMMIT TRANSACTION;
END
GO

CREATE OR ALTER PROCEDURE sp_GetPotentialWorkersByEvent
    @eventId     NVARCHAR(64),
    @firebaseUid NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(64);

    SELECT @companyId = company_ID
    FROM [User]
    WHERE FBUID = @firebaseUid;

    EXEC sp_GetPotentialWorkers
        @eventId = @eventId,
        @companyId = @companyId;
END
GO

CREATE OR ALTER PROCEDURE sp_SendOfferByEvent
    @eventId        NVARCHAR(64),
    @employeeFbUid  NVARCHAR(255),
    @managerFbUid   NVARCHAR(255),
    @shiftIdsCsv    NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM Event e
        INNER JOIN Project p ON p.Proj_ID = e.project_ID
        WHERE e.event_ID = @eventId
          AND p.Proj_ID IN (
              SELECT mp.project_ID
              FROM Manager_Project mp
              INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
              WHERE mu.company_ID = (
                  SELECT company_ID
                  FROM [User]
                  WHERE FBUID = @managerFbUid
              )
          )
    )
    BEGIN
        THROW 51001, 'Event not found.', 1;
    END

    DECLARE @employeeUserId NVARCHAR(64);

    SELECT @employeeUserId = eu.user_ID
    FROM [User] eu
    INNER JOIN Employee e ON e.user_ID = eu.user_ID
    WHERE eu.FBUID = @employeeFbUid
      AND eu.company_ID = (
          SELECT company_ID
          FROM [User]
          WHERE FBUID = @managerFbUid
      );

    IF @employeeUserId IS NULL
    BEGIN
        THROW 51002, 'Employee not found or not in your company.', 1;
    END

    DECLARE @shiftIds TABLE (Shift_ID NVARCHAR(64) PRIMARY KEY);

    INSERT INTO @shiftIds (Shift_ID)
    SELECT DISTINCT LTRIM(RTRIM(value))
    FROM STRING_SPLIT(@shiftIdsCsv, ',')
    WHERE LTRIM(RTRIM(value)) <> '';

    DECLARE @requestedCount INT = (SELECT COUNT(*) FROM @shiftIds);

    IF (
        SELECT COUNT(*)
        FROM Shift s
        INNER JOIN @shiftIds ids ON ids.Shift_ID = s.Shift_ID
        WHERE s.event_ID = @eventId
    ) <> @requestedCount
    BEGIN
        THROW 51003, 'One or more shift IDs do not belong to this event.', 1;
    END

    BEGIN TRANSACTION;

    MERGE INTO Employee_Shift AS target
    USING (
        SELECT Shift_ID, @employeeUserId AS employee_user_ID
        FROM @shiftIds
    ) AS source
    ON target.shift_ID = source.Shift_ID
       AND target.employee_user_ID = source.employee_user_ID
    WHEN MATCHED AND target.status NOT IN (
        'manager_offer_sent', 'employee_request', 'manager_hold', 'manager_approved'
    ) THEN
        UPDATE SET status = 'manager_offer_sent',
                   status_updated_at = GETUTCDATE(),
                   payment_status = 'pending'
    WHEN NOT MATCHED THEN
        INSERT (shift_ID, employee_user_ID, status, status_updated_at, payment_status)
        VALUES (source.Shift_ID, source.employee_user_ID, 'manager_offer_sent', GETUTCDATE(), 'pending');

    COMMIT TRANSACTION;
END
GO
