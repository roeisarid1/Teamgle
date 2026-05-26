-- Brief acknowledgment stored procedures
-- Run each CREATE OR ALTER PROCEDURE batch separately if your SQL tool does not support GO.

CREATE OR ALTER PROCEDURE sp_CheckBriefAccess
    @briefId NVARCHAR(64),
    @fbUid   NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM Brief b
        LEFT JOIN Project p ON p.Proj_ID = b.project_ID
        LEFT JOIN Event e ON e.event_ID = b.event_ID
        LEFT JOIN Project ep ON ep.Proj_ID = e.project_ID
        WHERE b.brief_ID = @briefId
          AND COALESCE(p.Proj_ID, ep.Proj_ID) IN (
              SELECT mp.project_ID
              FROM Manager_Project mp
              INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
              WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @fbUid)
          )
    ) THEN 1 ELSE 0 END AS HasAccess;
END
GO

CREATE OR ALTER PROCEDURE sp_CheckProjectBriefAccess
    @projId  NVARCHAR(64),
    @briefId NVARCHAR(64),
    @fbUid   NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM Brief b
        LEFT JOIN Project p ON p.Proj_ID = b.project_ID
        LEFT JOIN Event e ON e.event_ID = b.event_ID
        LEFT JOIN Project ep ON ep.Proj_ID = e.project_ID
        WHERE b.brief_ID = @briefId
          AND COALESCE(p.Proj_ID, ep.Proj_ID) = @projId
          AND COALESCE(p.Proj_ID, ep.Proj_ID) IN (
              SELECT mp.project_ID
              FROM Manager_Project mp
              INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
              WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @fbUid)
          )
    ) THEN 1 ELSE 0 END AS HasAccess;
END
GO

CREATE OR ALTER PROCEDURE sp_GetBriefAcknowledgments
    @briefId NVARCHAR(64),
    @fbUid   NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM Brief b
        LEFT JOIN Project p ON p.Proj_ID = b.project_ID
        LEFT JOIN Event e ON e.event_ID = b.event_ID
        LEFT JOIN Project ep ON ep.Proj_ID = e.project_ID
        WHERE b.brief_ID = @briefId
          AND COALESCE(p.Proj_ID, ep.Proj_ID) IN (
              SELECT mp.project_ID
              FROM Manager_Project mp
              INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
              WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @fbUid)
          )
    )
        RETURN;

    DECLARE @scopeProjectId NVARCHAR(64);
    DECLARE @scopeEventId NVARCHAR(64);
    DECLARE @scopeShiftId NVARCHAR(64);

    SELECT @scopeProjectId = project_ID,
           @scopeEventId = event_ID,
           @scopeShiftId = shift_ID
    FROM Brief
    WHERE brief_ID = @briefId;

    IF @scopeShiftId IS NOT NULL
    BEGIN
        SELECT DISTINCT u.user_ID AS EmployeeUserId, u.firstName AS FirstName, u.lastName AS LastName,
               CAST(COALESCE(ba.is_read, 0) AS bit) AS IsRead, ba.read_at AS ReadAt
        FROM Employee_Shift es
        INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
        LEFT JOIN Brief_Acknowledgment ba
               ON ba.employee_user_ID = es.employee_user_ID
              AND ba.brief_ID = @briefId
        WHERE es.shift_ID = @scopeShiftId
        ORDER BY u.lastName, u.firstName;
        RETURN;
    END

    IF @scopeEventId IS NOT NULL
    BEGIN
        SELECT DISTINCT u.user_ID AS EmployeeUserId, u.firstName AS FirstName, u.lastName AS LastName,
               CAST(COALESCE(ba.is_read, 0) AS bit) AS IsRead, ba.read_at AS ReadAt
        FROM Employee_Shift es
        INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
        INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
        LEFT JOIN Brief_Acknowledgment ba
               ON ba.employee_user_ID = es.employee_user_ID
              AND ba.brief_ID = @briefId
        WHERE s.event_ID = @scopeEventId
        ORDER BY u.lastName, u.firstName;
        RETURN;
    END

    SELECT DISTINCT u.user_ID AS EmployeeUserId, u.firstName AS FirstName, u.lastName AS LastName,
           CAST(COALESCE(ba.is_read, 0) AS bit) AS IsRead, ba.read_at AS ReadAt
    FROM Employee_Shift es
    INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
    INNER JOIN Event e ON e.event_ID = s.event_ID
    INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
    LEFT JOIN Brief_Acknowledgment ba
           ON ba.employee_user_ID = es.employee_user_ID
          AND ba.brief_ID = @briefId
    WHERE e.project_ID = @scopeProjectId
    ORDER BY u.lastName, u.firstName;
END
GO

CREATE OR ALTER PROCEDURE sp_GetProjectBriefAcknowledgments
    @projId  NVARCHAR(64),
    @briefId NVARCHAR(64),
    @fbUid   NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (
        SELECT 1
        FROM Brief b
        LEFT JOIN Project p ON p.Proj_ID = b.project_ID
        LEFT JOIN Event e ON e.event_ID = b.event_ID
        LEFT JOIN Project ep ON ep.Proj_ID = e.project_ID
        WHERE b.brief_ID = @briefId
          AND COALESCE(p.Proj_ID, ep.Proj_ID) = @projId
          AND COALESCE(p.Proj_ID, ep.Proj_ID) IN (
              SELECT mp.project_ID
              FROM Manager_Project mp
              INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
              WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @fbUid)
          )
    )
        RETURN;

    EXEC sp_GetBriefAcknowledgments @briefId = @briefId, @fbUid = @fbUid;
END
GO

CREATE OR ALTER PROCEDURE sp_AcknowledgeBrief
    @briefId NVARCHAR(64),
    @fbUid   NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @userId NVARCHAR(64);

    SELECT @userId = user_ID
    FROM [User]
    WHERE FBUID = @fbUid;

    IF @userId IS NULL
    BEGIN
        SELECT 0 AS RowsAffected;
        RETURN;
    END

    IF EXISTS (
        SELECT 1
        FROM Brief_Acknowledgment
        WHERE brief_ID = @briefId
          AND employee_user_ID = @userId
    )
    BEGIN
        UPDATE Brief_Acknowledgment
        SET is_read = 1,
            read_at = GETUTCDATE()
        WHERE brief_ID = @briefId
          AND employee_user_ID = @userId;
    END
    ELSE
    BEGIN
        INSERT INTO Brief_Acknowledgment (brief_ID, employee_user_ID, is_read, read_at)
        VALUES (@briefId, @userId, 1, GETUTCDATE());
    END

    SELECT 1 AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_GetBriefsForEmployee
    @fbUid NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT DISTINCT
        b.brief_ID, b.title, b.content, b.created_at,
        b.project_ID, b.event_ID, b.shift_ID,
        p.name AS ProjectName,
        e.name AS EventName,
        CAST(COALESCE(ba.is_read, 0) AS bit) AS IsAcknowledged,
        ba.read_at AS AcknowledgedAt
    FROM Brief b
    LEFT JOIN Project p ON p.Proj_ID = b.project_ID
    LEFT JOIN Event e ON e.event_ID = b.event_ID
    INNER JOIN (
        SELECT DISTINCT
            s.event_ID,
            e2.project_ID,
            es.shift_ID,
            u.FBUID
        FROM Employee_Shift es
        INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
        INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
        INNER JOIN Event e2 ON e2.event_ID = s.event_ID
        WHERE u.FBUID = @fbUid
          AND es.status = 'manager_approved'
    ) emp ON (
        (b.project_ID IS NOT NULL AND b.project_ID = emp.project_ID)
        OR (b.event_ID IS NOT NULL AND b.event_ID = emp.event_ID)
        OR (b.shift_ID IS NOT NULL AND b.shift_ID = emp.shift_ID)
    )
    LEFT JOIN Brief_Acknowledgment ba
           ON ba.brief_ID = b.brief_ID
          AND ba.employee_user_ID = (SELECT user_ID FROM [User] WHERE FBUID = @fbUid)
    ORDER BY b.created_at DESC;
END
GO
