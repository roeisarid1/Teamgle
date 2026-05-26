-- Keep brief acknowledgment counters and lists scoped to currently active workers only.
-- Run each CREATE OR ALTER PROCEDURE batch separately if your SQL tool does not support GO.

CREATE OR ALTER PROCEDURE sp_GetBriefById
    @briefId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT b.brief_ID, b.title, b.content, b.created_at,
           b.created_by_manager_user_ID,
           u.firstName + ' ' + u.lastName AS manager_name,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
            LEFT JOIN [Event] ev ON ev.event_ID = s.event_ID
            INNER JOIN Brief_Acknowledgment ba
                    ON ba.brief_ID = b.brief_ID
                   AND ba.employee_user_ID = es.employee_user_ID
                   AND ba.is_read = 1
            WHERE es.status IN ('approved', 'manager_approved')
              AND (es.canceled IS NULL OR es.canceled = 0)
              AND (
                   (b.shift_ID IS NOT NULL AND es.shift_ID = b.shift_ID)
                OR (b.event_ID IS NOT NULL AND s.event_ID = b.event_ID)
                OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
              )
           ) AS ack_count,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
            LEFT JOIN [Event] ev ON ev.event_ID = s.event_ID
            WHERE es.status IN ('approved', 'manager_approved')
              AND (es.canceled IS NULL OR es.canceled = 0)
              AND (
                   (b.shift_ID IS NOT NULL AND es.shift_ID = b.shift_ID)
                OR (b.event_ID IS NOT NULL AND s.event_ID = b.event_ID)
                OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
              )
           ) AS total_relevant
    FROM Brief b
    LEFT JOIN [User] u ON u.user_ID = b.created_by_manager_user_ID
    WHERE b.brief_ID = @briefId;
END
GO

CREATE OR ALTER PROCEDURE sp_GetProjectBriefs
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT b.brief_ID, b.title, b.content, b.created_at,
           b.created_by_manager_user_ID,
           u.firstName + ' ' + u.lastName AS manager_name,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
            LEFT JOIN [Event] ev ON ev.event_ID = s.event_ID
            INNER JOIN Brief_Acknowledgment ba
                    ON ba.brief_ID = b.brief_ID
                   AND ba.employee_user_ID = es.employee_user_ID
                   AND ba.is_read = 1
            WHERE es.status IN ('approved', 'manager_approved')
              AND (es.canceled IS NULL OR es.canceled = 0)
              AND (
                   (b.shift_ID IS NOT NULL AND es.shift_ID = b.shift_ID)
                OR (b.event_ID IS NOT NULL AND s.event_ID = b.event_ID)
                OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
              )
           ) AS ack_count,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
            LEFT JOIN [Event] ev ON ev.event_ID = s.event_ID
            WHERE es.status IN ('approved', 'manager_approved')
              AND (es.canceled IS NULL OR es.canceled = 0)
              AND (
                   (b.shift_ID IS NOT NULL AND es.shift_ID = b.shift_ID)
                OR (b.event_ID IS NOT NULL AND s.event_ID = b.event_ID)
                OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
              )
           ) AS total_relevant
    FROM Brief b
    LEFT JOIN [User] u ON u.user_ID = b.created_by_manager_user_ID
    WHERE b.project_ID = @projId
    ORDER BY b.created_at DESC;
END
GO

CREATE OR ALTER PROCEDURE sp_GetEventBriefs
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT b.brief_ID, b.title, b.content, b.created_at,
           b.created_by_manager_user_ID,
           u.firstName + ' ' + u.lastName AS manager_name,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
            LEFT JOIN [Event] ev ON ev.event_ID = s.event_ID
            INNER JOIN Brief_Acknowledgment ba
                    ON ba.brief_ID = b.brief_ID
                   AND ba.employee_user_ID = es.employee_user_ID
                   AND ba.is_read = 1
            WHERE es.status IN ('approved', 'manager_approved')
              AND (es.canceled IS NULL OR es.canceled = 0)
              AND (
                   (b.shift_ID IS NOT NULL AND es.shift_ID = b.shift_ID)
                OR (b.event_ID IS NOT NULL AND s.event_ID = b.event_ID)
                OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
              )
           ) AS ack_count,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
            LEFT JOIN [Event] ev ON ev.event_ID = s.event_ID
            WHERE es.status IN ('approved', 'manager_approved')
              AND (es.canceled IS NULL OR es.canceled = 0)
              AND (
                   (b.shift_ID IS NOT NULL AND es.shift_ID = b.shift_ID)
                OR (b.event_ID IS NOT NULL AND s.event_ID = b.event_ID)
                OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
              )
           ) AS total_relevant
    FROM Brief b
    LEFT JOIN [User] u ON u.user_ID = b.created_by_manager_user_ID
    WHERE b.event_ID = @eventId
    ORDER BY b.created_at DESC;
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
          AND es.status IN ('approved', 'manager_approved')
          AND (es.canceled IS NULL OR es.canceled = 0)
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
          AND es.status IN ('approved', 'manager_approved')
          AND (es.canceled IS NULL OR es.canceled = 0)
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
      AND es.status IN ('approved', 'manager_approved')
      AND (es.canceled IS NULL OR es.canceled = 0)
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
