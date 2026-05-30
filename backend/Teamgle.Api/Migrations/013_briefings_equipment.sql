-- Migration 013: Shift-level briefs + Shift_Equipment table and stored procedures.
-- Run once against the target DB before deploying the matching backend build.

-- ── Shift_Equipment table ─────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Shift_Equipment')
BEGIN
    CREATE TABLE Shift_Equipment (
        equipment_ID              NVARCHAR(64)   NOT NULL PRIMARY KEY,
        shift_ID                  NVARCHAR(64)   NOT NULL,
        name                      NVARCHAR(255)  NOT NULL,
        quantity                  INT            NOT NULL DEFAULT 1,
        notes                     NVARCHAR(MAX)  NULL,
        created_at                DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
        created_by_manager_user_ID NVARCHAR(64)  NULL,
        CONSTRAINT FK_ShiftEquipment_Shift FOREIGN KEY (shift_ID) REFERENCES Shift(Shift_ID),
        CONSTRAINT FK_ShiftEquipment_User  FOREIGN KEY (created_by_manager_user_ID) REFERENCES [User](user_ID)
    );
END
GO

-- ── sp_GetEventShifts ─────────────────────────────────────────────────────
-- Returns all shifts for an event with role info (lightweight, for briefings tab).
CREATE OR ALTER PROCEDURE sp_GetEventShifts
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT s.Shift_ID AS ShiftId,
           r.Roll_name AS RoleName,
           s.start_time AS StartTime,
           s.end_time AS EndTime
    FROM Shift s
    LEFT JOIN Roll r ON r.Roll_ID = s.roll_ID
    WHERE s.event_ID = @eventId
    ORDER BY s.start_time;
END
GO

-- ── sp_GetShiftBriefs ─────────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_GetShiftBriefs
    @shiftId NVARCHAR(64)
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
              AND es.shift_ID = b.shift_ID
           ) AS ack_count,
           (SELECT COUNT(DISTINCT es.employee_user_ID)
            FROM Employee_Shift es
            WHERE es.shift_ID = @shiftId
              AND es.status IN ('approved', 'manager_approved')
              AND (es.canceled IS NULL OR es.canceled = 0)
           ) AS total_relevant
    FROM Brief b
    LEFT JOIN [User] u ON u.user_ID = b.created_by_manager_user_ID
    WHERE b.shift_ID = @shiftId
    ORDER BY b.created_at DESC;
END
GO

-- ── sp_CreateShiftBrief ───────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_CreateShiftBrief
    @briefId   NVARCHAR(64),
    @title     NVARCHAR(255),
    @content   NVARCHAR(MAX),
    @createdAt DATETIME2,
    @firebaseUid NVARCHAR(256),
    @shiftId   NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @managerId NVARCHAR(64);
    SELECT @managerId = user_ID FROM [User] WHERE FBUID = @firebaseUid;

    INSERT INTO Brief (brief_ID, title, content, created_at, created_by_manager_user_ID, project_ID, event_ID, shift_ID)
    VALUES (@briefId, @title, @content, @createdAt, @managerId, NULL, NULL, @shiftId);

    EXEC sp_GetBriefById @briefId = @briefId;
END
GO

-- ── sp_UpdateShiftBrief ───────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_UpdateShiftBrief
    @briefId NVARCHAR(64),
    @title   NVARCHAR(255),
    @content NVARCHAR(MAX),
    @shiftId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Brief
    SET title = @title,
        content = @content
    WHERE brief_ID = @briefId
      AND shift_ID = @shiftId;

    IF @@ROWCOUNT > 0
        EXEC sp_GetBriefById @briefId = @briefId;
END
GO

-- ── sp_DeleteShiftBrief ───────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_DeleteShiftBrief
    @briefId NVARCHAR(64),
    @shiftId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM Brief_Acknowledgment
    WHERE brief_ID = @briefId;

    DELETE FROM Brief
    WHERE brief_ID = @briefId
      AND shift_ID = @shiftId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

-- ── sp_CheckShiftAccess ───────────────────────────────────────────────────
-- Returns the event_ID if the manager (by fbUid) has access to this shift's event.
CREATE OR ALTER PROCEDURE sp_CheckShiftAccess
    @shiftId NVARCHAR(64),
    @fbUid   NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT s.event_ID
    FROM Shift s
    INNER JOIN [Event] e  ON e.event_ID  = s.event_ID
    INNER JOIN Project p  ON p.Proj_ID   = e.project_ID
    WHERE s.Shift_ID = @shiftId
      AND p.Proj_ID IN (
          SELECT mp.project_ID
          FROM Manager_Project mp
          INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
          WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @fbUid)
      );
END
GO

-- ── sp_GetShiftEquipment ──────────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_GetShiftEquipment
    @shiftId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT se.equipment_ID, se.shift_ID, se.name, se.quantity, se.notes, se.created_at,
           u.firstName + ' ' + u.lastName AS created_by_manager_name
    FROM Shift_Equipment se
    LEFT JOIN [User] u ON u.user_ID = se.created_by_manager_user_ID
    WHERE se.shift_ID = @shiftId
    ORDER BY se.created_at ASC;
END
GO

-- ── sp_CreateShiftEquipment ───────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_CreateShiftEquipment
    @equipmentId NVARCHAR(64),
    @shiftId     NVARCHAR(64),
    @name        NVARCHAR(255),
    @quantity    INT,
    @notes       NVARCHAR(MAX),
    @firebaseUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @managerId NVARCHAR(64);
    SELECT @managerId = user_ID FROM [User] WHERE FBUID = @firebaseUid;

    INSERT INTO Shift_Equipment (equipment_ID, shift_ID, name, quantity, notes, created_at, created_by_manager_user_ID)
    VALUES (@equipmentId, @shiftId, @name, @quantity, @notes, GETUTCDATE(), @managerId);

    SELECT se.equipment_ID, se.shift_ID, se.name, se.quantity, se.notes, se.created_at,
           u.firstName + ' ' + u.lastName AS created_by_manager_name
    FROM Shift_Equipment se
    LEFT JOIN [User] u ON u.user_ID = se.created_by_manager_user_ID
    WHERE se.equipment_ID = @equipmentId;
END
GO

-- ── sp_UpdateShiftEquipment ───────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_UpdateShiftEquipment
    @equipmentId NVARCHAR(64),
    @shiftId     NVARCHAR(64),
    @name        NVARCHAR(255),
    @quantity    INT,
    @notes       NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Shift_Equipment
    SET name     = @name,
        quantity = @quantity,
        notes    = @notes
    WHERE equipment_ID = @equipmentId
      AND shift_ID     = @shiftId;

    IF @@ROWCOUNT > 0
    BEGIN
        SELECT se.equipment_ID, se.shift_ID, se.name, se.quantity, se.notes, se.created_at,
               u.firstName + ' ' + u.lastName AS created_by_manager_name
        FROM Shift_Equipment se
        LEFT JOIN [User] u ON u.user_ID = se.created_by_manager_user_ID
        WHERE se.equipment_ID = @equipmentId;
    END
END
GO

-- ── sp_DeleteShiftEquipment ───────────────────────────────────────────────
CREATE OR ALTER PROCEDURE sp_DeleteShiftEquipment
    @equipmentId NVARCHAR(64),
    @shiftId     NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM Shift_Equipment
    WHERE equipment_ID = @equipmentId
      AND shift_ID     = @shiftId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

-- ── sp_GetEquipmentForEmployee ────────────────────────────────────────────
-- Returns all equipment for shifts the employee is assigned to (manager_approved).
CREATE OR ALTER PROCEDURE sp_GetEquipmentForEmployee
    @fbUid NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT se.equipment_ID, se.shift_ID, se.name, se.quantity, se.notes, se.created_at,
           s.event_ID AS event_ID,
           e.project_ID AS project_ID
    FROM Shift_Equipment se
    INNER JOIN Shift s ON s.Shift_ID = se.shift_ID
    INNER JOIN [Event] e ON e.event_ID = s.event_ID
    INNER JOIN Employee_Shift es ON es.shift_ID = se.shift_ID
    INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
    WHERE u.FBUID = @fbUid
      AND es.status = 'manager_approved'
      AND (es.canceled IS NULL OR es.canceled = 0)
    ORDER BY se.created_at ASC;
END
GO
