-- Auto-assign stored procedures
-- Run each CREATE OR ALTER PROCEDURE batch separately if your SQL tool does not support GO.

CREATE OR ALTER PROCEDURE sp_GetAutoAssignShift
    @shiftId      NVARCHAR(64),
    @managerFbUid NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT s.required_quantity, s.start_time, s.end_time, r.Roll_name AS RoleName
    FROM Shift s
    INNER JOIN Roll r ON r.Roll_ID = s.roll_ID
    INNER JOIN Event e ON e.event_ID = s.event_ID
    INNER JOIN Project p ON p.Proj_ID = e.project_ID
    INNER JOIN Manager_Project mp ON mp.project_ID = p.Proj_ID
    INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
    WHERE s.Shift_ID = @shiftId
      AND mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @managerFbUid);
END
GO

CREATE OR ALTER PROCEDURE sp_GetAutoAssignApprovedCount
    @shiftId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT COUNT(*)
    FROM Employee_Shift
    WHERE shift_ID = @shiftId
      AND status = 'manager_approved';
END
GO

CREATE OR ALTER PROCEDURE sp_GetAutoAssignCandidates
    @shiftId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        u.user_ID AS UserId,
        u.FBUID AS FbUid,
        u.firstName AS FirstName,
        u.lastName AS LastName,
        ISNULL(e.cost_per_hour, 0) AS CostPerHour,
        (
            SELECT COUNT(*)
            FROM Employee_Shift es2
            WHERE es2.employee_user_ID = u.user_ID
              AND es2.status <> 'employee_rejected'
        ) AS RegisteredShifts,
        (
            SELECT COUNT(*)
            FROM Employee_Shift es2
            WHERE es2.employee_user_ID = u.user_ID
        ) AS OfferedShifts,
        ISNULL((
            SELECT AVG(
                CASE
                    WHEN DATEDIFF(minute, s2.start_time, es2.actual_start_time) > 0
                    THEN DATEDIFF(minute, s2.start_time, es2.actual_start_time)
                    ELSE 0
                END
            )
            FROM Employee_Shift es2
            INNER JOIN Shift s2 ON s2.Shift_ID = es2.shift_ID
            WHERE es2.employee_user_ID = u.user_ID
              AND es2.status = 'manager_approved'
              AND es2.actual_start_time IS NOT NULL
        ), 0) AS AttendanceAccuracy,
        ISNULL(
            CAST((
                SELECT COUNT(*)
                FROM Employee_Shift es2
                INNER JOIN Shift s2 ON s2.Shift_ID = es2.shift_ID
                WHERE es2.employee_user_ID = u.user_ID
                  AND es2.status = 'manager_approved'
                  AND s2.roll_ID = (SELECT roll_ID FROM Shift WHERE Shift_ID = @shiftId)
            ) AS FLOAT)
            / NULLIF((
                SELECT COUNT(*)
                FROM Employee_Shift es2
                WHERE es2.employee_user_ID = u.user_ID
                  AND es2.status = 'manager_approved'
            ), 0),
        0) AS RoleFitScore
    FROM Employee_Shift es
    INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
    INNER JOIN Employee e ON e.user_ID = u.user_ID
    WHERE es.shift_ID = @shiftId
      AND es.status = 'employee_request'
      AND NOT EXISTS (
          SELECT 1
          FROM Employee_Shift es3
          INNER JOIN Shift s2 ON s2.Shift_ID = es3.shift_ID
          INNER JOIN Shift s3 ON s3.Shift_ID = @shiftId
          WHERE es3.employee_user_ID = u.user_ID
            AND es3.status = 'manager_approved'
            AND s2.Shift_ID <> @shiftId
            AND s2.event_ID = s3.event_ID
            AND s2.start_time < s3.end_time
            AND s2.end_time > s3.start_time
      );
END
GO

CREATE OR ALTER PROCEDURE sp_ApplyAutoAssignDecisions
    @shiftId    NVARCHAR(64),
    @approveCsv NVARCHAR(MAX),
    @standbyCsv NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @approve TABLE (UserId NVARCHAR(64) PRIMARY KEY);
    DECLARE @standby TABLE (UserId NVARCHAR(64) PRIMARY KEY);

    INSERT INTO @approve (UserId)
    SELECT DISTINCT LTRIM(RTRIM(value))
    FROM STRING_SPLIT(@approveCsv, ',')
    WHERE LTRIM(RTRIM(value)) <> '';

    INSERT INTO @standby (UserId)
    SELECT DISTINCT LTRIM(RTRIM(value))
    FROM STRING_SPLIT(@standbyCsv, ',')
    WHERE LTRIM(RTRIM(value)) <> '';

    BEGIN TRANSACTION;

    UPDATE es
    SET status = 'manager_approved',
        status_updated_at = GETUTCDATE()
    FROM Employee_Shift es
    INNER JOIN @approve a ON a.UserId = es.employee_user_ID
    WHERE es.shift_ID = @shiftId
      AND es.status = 'employee_request';

    UPDATE es
    SET status = 'manager_hold',
        status_updated_at = GETUTCDATE()
    FROM Employee_Shift es
    INNER JOIN @standby s ON s.UserId = es.employee_user_ID
    WHERE es.shift_ID = @shiftId
      AND es.status = 'employee_request';

    COMMIT TRANSACTION;
END
GO
