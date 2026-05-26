-- Migration 002: Move small repository inline SQL into stored procedures.
-- Run once against the target DB before deploying the matching backend build.

CREATE OR ALTER PROCEDURE sp_GetUnregisteredUserByEmail
    @email NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.user_ID,
        u.FBUID,
        u.email,
        u.firstName,
        u.lastName,
        u.DOB,
        u.phoneNum,
        u.created_at,
        u.company_ID,
        CASE WHEN m.user_ID IS NOT NULL THEN 1 ELSE 0 END AS IsManager,
        CASE WHEN e.user_ID IS NOT NULL THEN 1 ELSE 0 END AS IsEmployee,
        e.cost_per_hour
    FROM [User] u
    LEFT JOIN Manager m ON u.user_ID = m.user_ID
    LEFT JOIN Employee e ON u.user_ID = e.user_ID
    WHERE u.email = @email
      AND u.FBUID IS NULL;
END
GO

CREATE OR ALTER PROCEDURE sp_SaveFirebaseUid
    @email NVARCHAR(256),
    @fbuid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [User]
    SET FBUID = @fbuid
    WHERE email = @email
      AND FBUID IS NULL;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_GetUserByFirebaseUid
    @fbuid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.user_ID,
        u.FBUID,
        u.email,
        u.firstName,
        u.lastName,
        u.DOB,
        u.phoneNum,
        u.created_at,
        u.company_ID,
        CASE WHEN m.user_ID IS NOT NULL THEN 1 ELSE 0 END AS IsManager,
        CASE WHEN e.user_ID IS NOT NULL THEN 1 ELSE 0 END AS IsEmployee,
        e.cost_per_hour
    FROM [User] u
    LEFT JOIN Manager m ON u.user_ID = m.user_ID
    LEFT JOIN Employee e ON u.user_ID = e.user_ID
    WHERE u.FBUID = @fbuid;
END
GO

CREATE OR ALTER PROCEDURE sp_GetTasksByManager
    @fbuid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        t.task_ID                           AS TaskId,
        t.content                           AS Content,
        t.priority                          AS Priority,
        t.status                            AS Status,
        t.project_ID                        AS ProjectId,
        t.event_ID                          AS EventId,
        t.shift_ID                          AS ShiftId,
        COALESCE(dp.name, ep.name, sp.name) AS ProjectName,
        COALESCE(de.name, se.name)          AS EventName
    FROM Task t
    LEFT JOIN Project  dp ON t.project_ID = dp.Proj_ID
    LEFT JOIN Customer c1 ON dp.customer_ID = c1.customer_ID
    LEFT JOIN [Event]  de ON t.event_ID = de.event_ID
    LEFT JOIN Project  ep ON de.project_ID = ep.Proj_ID
    LEFT JOIN Customer c2 ON ep.customer_ID = c2.customer_ID
    LEFT JOIN Shift    ds ON t.shift_ID = ds.Shift_ID
    LEFT JOIN [Event]  se ON ds.event_ID = se.event_ID
    LEFT JOIN Project  sp ON se.project_ID = sp.Proj_ID
    LEFT JOIN Customer c3 ON sp.customer_ID = c3.customer_ID
    WHERE COALESCE(c1.company_ID, c2.company_ID, c3.company_ID) =
          (SELECT u.company_ID FROM [User] u WHERE u.FBUID = @fbuid)
    ORDER BY t.task_ID;
END
GO

CREATE OR ALTER PROCEDURE sp_GetCompanyIdByFbUid
    @fbuid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT company_ID
    FROM [User]
    WHERE FBUID = @fbuid;
END
GO

CREATE OR ALTER PROCEDURE sp_GetShiftChampions
    @companyId NVARCHAR(64),
    @fromDate DATETIME2 = NULL,
    @toDate DATETIME2 = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.user_ID                            AS UserId,
        u.FBUID                              AS FbUid,
        CONCAT(u.firstName, ' ', u.lastName) AS Name,
        COUNT(DISTINCT ev.event_ID)          AS EventCount
    FROM [User] u
    INNER JOIN Employee emp ON emp.user_ID = u.user_ID
    INNER JOIN Employee_Shift es ON es.employee_user_ID = u.user_ID
    INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
    INNER JOIN [Event] ev ON ev.event_ID = s.event_ID
    WHERE u.company_ID = @companyId
      AND es.status = 'manager_approved'
      AND ISNULL(es.canceled, 0) = 0
      AND ev.end_time < GETUTCDATE()
      AND (@fromDate IS NULL OR ev.end_time >= @fromDate)
      AND (@toDate IS NULL OR ev.end_time < @toDate)
    GROUP BY u.user_ID, u.FBUID, u.firstName, u.lastName
    ORDER BY COUNT(DISTINCT ev.event_ID) DESC, u.lastName, u.firstName;
END
GO
