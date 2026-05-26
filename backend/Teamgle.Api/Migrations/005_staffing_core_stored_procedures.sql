-- Migration 005: Move core staffing/application flows into stored procedures.
-- Run once against the target DB before deploying the matching backend build.

CREATE OR ALTER PROCEDURE sp_GetJobOffersForEmployee
    @fbuid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        es.shift_ID,
        es.status,
        es.pay_rate_per_hour,
        es.notes,
        es.planned_start_time,
        es.planned_end_time,
        s.start_time AS shift_start_time,
        s.end_time AS shift_end_time,
        r.Roll_name,
        e.event_ID,
        e.name AS event_name,
        e.location AS event_location,
        e.event_type,
        e.attendees_count,
        p.name AS project_name,
        u.firstName + ' ' + u.lastName AS manager_name
    FROM Employee_Shift es
    INNER JOIN [User] eu ON es.employee_user_ID = eu.user_ID
    INNER JOIN Shift s ON es.shift_ID = s.Shift_ID
    INNER JOIN Roll r ON s.roll_ID = r.Roll_ID
    INNER JOIN [Event] e ON s.event_ID = e.event_ID
    INNER JOIN Project p ON e.project_ID = p.Proj_ID
    INNER JOIN Manager_Project mp ON p.Proj_ID = mp.project_ID AND mp.is_owner = 1
    INNER JOIN [User] u ON mp.manager_user_ID = u.user_ID
    WHERE eu.FBUID = @fbuid
      AND es.status IN (
          'manager_offer_sent',
          'employee_request',
          'employee_request_canceled'
      )
    ORDER BY
        CASE es.status
            WHEN 'manager_offer_sent' THEN 0
            WHEN 'employee_request' THEN 1
            WHEN 'employee_request_canceled' THEN 2
            ELSE 3
        END,
        COALESCE(es.planned_start_time, s.start_time);
END
GO

CREATE OR ALTER PROCEDURE sp_RespondToJobOffer
    @newStatus NVARCHAR(64),
    @shiftId NVARCHAR(64),
    @fbuid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Employee_Shift
    SET status = @newStatus,
        status_updated_at = GETUTCDATE()
    WHERE shift_ID = @shiftId
      AND employee_user_ID = (SELECT user_ID FROM [User] WHERE FBUID = @fbuid)
      AND status = 'manager_offer_sent';

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_GetEventWorkers
    @eventId NVARCHAR(64),
    @firebaseUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        es.shift_ID AS ShiftId,
        u.user_ID AS UserId,
        u.FBUID AS FbUid,
        u.firstName AS FirstName,
        u.lastName AS LastName,
        r.Roll_name AS RoleName,
        es.status AS Status,
        s.start_time AS ShiftStart,
        s.end_time AS ShiftEnd,
        s.required_quantity AS RequiredQuantity,
        emp.cost_per_hour AS CostPerHour,
        (SELECT COUNT(*) FROM Employee_Shift ea
         WHERE ea.shift_ID = s.Shift_ID
           AND ea.status IN (
               'manager_offer_sent','employee_request',
               'manager_hold','manager_approved'
           )
        ) AS ActiveAssignments
    FROM Employee_Shift es
    INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
    LEFT JOIN Employee emp ON emp.user_ID = es.employee_user_ID
    INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
    INNER JOIN Roll r ON r.Roll_ID = s.roll_ID
    INNER JOIN [Event] e ON e.event_ID = s.event_ID
    INNER JOIN Project p ON p.Proj_ID = e.project_ID
    WHERE e.event_ID = @eventId
      AND p.Proj_ID IN (
          SELECT mp.project_ID
          FROM Manager_Project mp
          INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
          WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @firebaseUid)
      )
      AND es.status IN (
          'manager_offer_sent',
          'employee_request',
          'manager_approved',
          'manager_hold',
          'manager_reject',
          'manager_approved_canceled',
          'employee_request_canceled'
      )
    ORDER BY u.lastName, u.firstName;
END
GO

CREATE OR ALTER PROCEDURE sp_UpdateWorkerStatus
    @newStatus NVARCHAR(64),
    @shiftId NVARCHAR(64),
    @employeeFbUid NVARCHAR(256),
    @eventId NVARCHAR(64),
    @managerFbUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    IF @newStatus = 'manager_approved'
    BEGIN
        DECLARE @targetStart DATETIME2;
        DECLARE @targetEnd DATETIME2;

        SELECT @targetStart = start_time, @targetEnd = end_time
        FROM Shift
        WHERE Shift_ID = @shiftId;

        IF @targetStart IS NOT NULL AND @targetEnd IS NOT NULL
           AND EXISTS (
                SELECT 1
                FROM Employee_Shift es
                INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
                WHERE es.employee_user_ID = (SELECT user_ID FROM [User] WHERE FBUID = @employeeFbUid)
                  AND s.event_ID = @eventId
                  AND es.shift_ID <> @shiftId
                  AND es.status = 'manager_approved'
                  AND s.start_time < @targetEnd
                  AND s.end_time > @targetStart
           )
        BEGIN
            RAISERROR('This employee is already approved for an overlapping shift in this event.', 16, 1);
            RETURN;
        END

        IF EXISTS (
            SELECT 1
            FROM Shift s
            LEFT JOIN Employee_Shift es2
                   ON es2.shift_ID = s.Shift_ID
                  AND es2.status = 'manager_approved'
                  AND es2.employee_user_ID <> (SELECT user_ID FROM [User] WHERE FBUID = @employeeFbUid)
            WHERE s.Shift_ID = @shiftId
            GROUP BY s.required_quantity
            HAVING s.required_quantity > 0
               AND COUNT(es2.employee_user_ID) >= s.required_quantity
        )
        BEGIN
            RAISERROR('This shift is already full.', 16, 1);
            RETURN;
        END
    END

    UPDATE Employee_Shift
    SET status = @newStatus,
        status_updated_at = GETUTCDATE()
    WHERE shift_ID = @shiftId
      AND employee_user_ID = (SELECT user_ID FROM [User] WHERE FBUID = @employeeFbUid)
      AND shift_ID IN (
          SELECT s.Shift_ID
          FROM Shift s
          INNER JOIN [Event] e ON e.event_ID = s.event_ID
          INNER JOIN Project p ON p.Proj_ID = e.project_ID
          WHERE e.event_ID = @eventId
            AND p.Proj_ID IN (
                SELECT mp.project_ID
                FROM Manager_Project mp
                INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
                WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @managerFbUid)
            )
      );

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_DeleteWorkerAssignment
    @shiftId NVARCHAR(64),
    @employeeFbUid NVARCHAR(256),
    @eventId NVARCHAR(64),
    @managerFbUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM Employee_Shift
    WHERE shift_ID = @shiftId
      AND employee_user_ID = (SELECT user_ID FROM [User] WHERE FBUID = @employeeFbUid)
      AND shift_ID IN (
          SELECT s.Shift_ID
          FROM Shift s
          INNER JOIN [Event] e ON e.event_ID = s.event_ID
          INNER JOIN Project p ON p.Proj_ID = e.project_ID
          WHERE e.event_ID = @eventId
            AND p.Proj_ID IN (
                SELECT mp.project_ID
                FROM Manager_Project mp
                INNER JOIN [User] mu ON mu.user_ID = mp.manager_user_ID
                WHERE mu.company_ID = (SELECT company_ID FROM [User] WHERE FBUID = @managerFbUid)
            )
      );
END
GO

CREATE OR ALTER PROCEDURE sp_GetMyApplications
    @firebaseUid NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        es.shift_ID AS ShiftId,
        es.status AS Status,
        r.Roll_name AS RoleName,
        e.event_ID AS EventId,
        e.name AS EventName,
        e.location AS EventLocation,
        e.start_time AS EventStart,
        e.end_time AS EventEnd,
        s.start_time AS ShiftStart,
        s.end_time AS ShiftEnd,
        p.Proj_ID AS ProjectId,
        p.name AS ProjectName,
        es.actual_start_time AS ActualStart,
        es.actual_end_time AS ActualEnd,
        es.pay_rate_per_hour AS PayRatePerHour,
        es.approved_regular_hours AS ApprovedRegularHours,
        es.approved_overtime_hours AS ApprovedOvertimeHours,
        ISNULL(es.payment_status, '') AS PaymentStatus
    FROM Employee_Shift es
    INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
    INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
    INNER JOIN Roll r ON r.Roll_ID = s.roll_ID
    INNER JOIN [Event] e ON e.event_ID = s.event_ID
    INNER JOIN Project p ON p.Proj_ID = e.project_ID
    WHERE u.FBUID = @firebaseUid
      AND es.status IN (
          'employee_request',
          'manager_approved',
          'manager_hold',
          'manager_reject',
          'manager_approved_canceled'
      )
    ORDER BY COALESCE(e.start_time, s.start_time) DESC;
END
GO

CREATE OR ALTER PROCEDURE sp_ReportHours
    @shiftId NVARCHAR(64),
    @fbuid NVARCHAR(256),
    @actualStart DATETIME2 = NULL,
    @actualEnd DATETIME2 = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Employee_Shift
    SET actual_start_time = @actualStart,
        actual_end_time = @actualEnd,
        approved_regular_hours = NULL,
        approved_overtime_hours = NULL,
        payment_status = CASE
                           WHEN payment_status = 'paid' THEN payment_status
                           ELSE 'pending'
                         END,
        status_updated_at = GETUTCDATE()
    WHERE shift_ID = @shiftId
      AND employee_user_ID = (SELECT user_ID FROM [User] WHERE FBUID = @fbuid)
      AND status = 'manager_approved'
      AND ISNULL(payment_status, '') <> 'paid';

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO
