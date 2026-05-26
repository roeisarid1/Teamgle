-- Migration 004: Move ProjectRepository tasks and briefs into stored procedures.
-- Run once against the target DB before deploying the matching backend build.

CREATE OR ALTER PROCEDURE sp_GetUserIdByFbUid
    @fbUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT user_ID
    FROM [User]
    WHERE FBUID = @fbUid;
END
GO

CREATE OR ALTER PROCEDURE sp_CheckEventAccess
    @eventId NVARCHAR(64),
    @fbUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT p.Proj_ID
    FROM [Event] e
    INNER JOIN Project p ON p.Proj_ID = e.project_ID
    WHERE e.event_ID = @eventId
      AND p.Proj_ID IN (
          SELECT mp.project_ID
          FROM Manager_Project mp
          INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
          WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @fbUid)
      );
END
GO

CREATE OR ALTER PROCEDURE sp_GetProjectTasks
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT task_ID, content, status, priority
    FROM Task
    WHERE project_ID = @projId
    ORDER BY task_ID ASC;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateProjectTask
    @taskId NVARCHAR(64),
    @content NVARCHAR(MAX),
    @status NVARCHAR(50),
    @priority NVARCHAR(50),
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO Task (task_ID, content, status, priority, project_ID, event_ID, shift_ID)
    VALUES (@taskId, @content, @status, @priority, @projId, NULL, NULL);
END
GO

CREATE OR ALTER PROCEDURE sp_UpdateProjectTask
    @taskId NVARCHAR(64),
    @content NVARCHAR(MAX),
    @status NVARCHAR(50),
    @priority NVARCHAR(50),
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Task
    SET content = @content,
        status = @status,
        priority = @priority
    WHERE task_ID = @taskId
      AND project_ID = @projId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_DeleteProjectTask
    @taskId NVARCHAR(64),
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM Task
    WHERE task_ID = @taskId
      AND project_ID = @projId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_GetEventTasks
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT task_ID, content, status, priority
    FROM Task
    WHERE event_ID = @eventId
    ORDER BY task_ID ASC;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateEventTask
    @taskId NVARCHAR(64),
    @content NVARCHAR(MAX),
    @status NVARCHAR(50),
    @priority NVARCHAR(50),
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO Task (task_ID, content, status, priority, project_ID, event_ID, shift_ID)
    VALUES (@taskId, @content, @status, @priority, NULL, @eventId, NULL);
END
GO

CREATE OR ALTER PROCEDURE sp_UpdateEventTask
    @taskId NVARCHAR(64),
    @content NVARCHAR(MAX),
    @status NVARCHAR(50),
    @priority NVARCHAR(50),
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Task
    SET content = @content,
        status = @status,
        priority = @priority
    WHERE task_ID = @taskId
      AND event_ID = @eventId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_DeleteEventTask
    @taskId NVARCHAR(64),
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM Task
    WHERE task_ID = @taskId
      AND event_ID = @eventId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_GetBriefById
    @briefId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT b.brief_ID, b.title, b.content, b.created_at,
           b.created_by_manager_user_ID,
           u.firstName + ' ' + u.lastName AS manager_name,
           (SELECT COUNT(*) FROM Brief_Acknowledgment ba
            WHERE ba.brief_ID = b.brief_ID AND ba.is_read = 1) AS ack_count,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
            LEFT JOIN [Event] ev ON ev.event_ID = s.event_ID
            WHERE (b.shift_ID IS NOT NULL AND es.shift_ID = b.shift_ID)
               OR (b.event_ID IS NOT NULL AND s.event_ID = b.event_ID)
               OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
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
           (SELECT COUNT(*) FROM Brief_Acknowledgment ba
            WHERE ba.brief_ID = b.brief_ID AND ba.is_read = 1) AS ack_count,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
            LEFT JOIN [Event] ev ON ev.event_ID = s.event_ID
            WHERE (b.shift_ID IS NOT NULL AND es.shift_ID = b.shift_ID)
               OR (b.event_ID IS NOT NULL AND s.event_ID = b.event_ID)
               OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
           ) AS total_relevant
    FROM Brief b
    LEFT JOIN [User] u ON u.user_ID = b.created_by_manager_user_ID
    WHERE b.project_ID = @projId
    ORDER BY b.created_at DESC;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateProjectBrief
    @briefId NVARCHAR(64),
    @title NVARCHAR(255),
    @content NVARCHAR(MAX),
    @createdAt DATETIME2,
    @firebaseUid NVARCHAR(256),
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @managerId NVARCHAR(64);
    SELECT @managerId = user_ID FROM [User] WHERE FBUID = @firebaseUid;

    INSERT INTO Brief (brief_ID, title, content, created_at, created_by_manager_user_ID, project_ID, event_ID, shift_ID)
    VALUES (@briefId, @title, @content, @createdAt, @managerId, @projId, NULL, NULL);

    EXEC sp_GetBriefById @briefId = @briefId;
END
GO

CREATE OR ALTER PROCEDURE sp_UpdateProjectBrief
    @briefId NVARCHAR(64),
    @title NVARCHAR(255),
    @content NVARCHAR(MAX),
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Brief
    SET title = @title,
        content = @content
    WHERE brief_ID = @briefId
      AND project_ID = @projId;

    IF @@ROWCOUNT > 0
        EXEC sp_GetBriefById @briefId = @briefId;
END
GO

CREATE OR ALTER PROCEDURE sp_DeleteProjectBrief
    @briefId NVARCHAR(64),
    @projId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM Brief
    WHERE brief_ID = @briefId
      AND project_ID = @projId;

    SELECT @@ROWCOUNT AS RowsAffected;
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
           (SELECT COUNT(*) FROM Brief_Acknowledgment ba
            WHERE ba.brief_ID = b.brief_ID AND ba.is_read = 1) AS ack_count,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
            LEFT JOIN [Event] ev ON ev.event_ID = s.event_ID
            WHERE (b.shift_ID IS NOT NULL AND es.shift_ID = b.shift_ID)
               OR (b.event_ID IS NOT NULL AND s.event_ID = b.event_ID)
               OR (b.project_ID IS NOT NULL AND ev.project_ID = b.project_ID)
           ) AS total_relevant
    FROM Brief b
    LEFT JOIN [User] u ON u.user_ID = b.created_by_manager_user_ID
    WHERE b.event_ID = @eventId
    ORDER BY b.created_at DESC;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateEventBrief
    @briefId NVARCHAR(64),
    @title NVARCHAR(255),
    @content NVARCHAR(MAX),
    @createdAt DATETIME2,
    @firebaseUid NVARCHAR(256),
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @managerId NVARCHAR(64);
    SELECT @managerId = user_ID FROM [User] WHERE FBUID = @firebaseUid;

    INSERT INTO Brief (brief_ID, title, content, created_at, created_by_manager_user_ID, project_ID, event_ID, shift_ID)
    VALUES (@briefId, @title, @content, @createdAt, @managerId, NULL, @eventId, NULL);

    EXEC sp_GetBriefById @briefId = @briefId;
END
GO

CREATE OR ALTER PROCEDURE sp_UpdateEventBrief
    @briefId NVARCHAR(64),
    @title NVARCHAR(255),
    @content NVARCHAR(MAX),
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Brief
    SET title = @title,
        content = @content
    WHERE brief_ID = @briefId
      AND event_ID = @eventId;

    IF @@ROWCOUNT > 0
        EXEC sp_GetBriefById @briefId = @briefId;
END
GO

CREATE OR ALTER PROCEDURE sp_DeleteEventBrief
    @briefId NVARCHAR(64),
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM Brief_Acknowledgment
    WHERE brief_ID = @briefId;

    DELETE FROM Brief
    WHERE brief_ID = @briefId
      AND event_ID = @eventId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO
