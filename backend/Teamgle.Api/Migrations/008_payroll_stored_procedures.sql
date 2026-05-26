-- Payroll and hours stored procedures
-- Run each CREATE OR ALTER PROCEDURE batch separately if your SQL tool does not support GO.

CREATE OR ALTER PROCEDURE sp_GetEventPayroll
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT u.user_ID AS EmployeeUserId, u.FBUID AS EmployeeFbUid,
           u.firstName AS FirstName, u.lastName AS LastName,
           es.shift_ID AS ShiftId, r.Roll_name AS RoleName,
           s.start_time AS ShiftStart, s.end_time AS ShiftEnd,
           es.actual_start_time AS ActualStart, es.actual_end_time AS ActualEnd,
           s.bulk_actual_start_time AS ShiftBulkStart, s.bulk_actual_end_time AS ShiftBulkEnd,
           es.manager_actual_start_time AS ManagerOverrideStart, es.manager_actual_end_time AS ManagerOverrideEnd,
           CASE
               WHEN es.is_manager_hours_override = 1 THEN 'manager_override'
               WHEN s.bulk_actual_start_time IS NOT NULL OR s.bulk_actual_end_time IS NOT NULL THEN 'shift_bulk'
               WHEN es.actual_start_time IS NOT NULL OR es.actual_end_time IS NOT NULL THEN 'employee_report'
               ELSE 'none'
           END AS HoursSource,
           es.approved_regular_hours AS ApprovedRegularHours,
           es.approved_overtime_hours AS ApprovedOvertimeHours,
           es.approved_at AS ApprovedAt,
           es.approved_by_manager_user_ID AS ApprovedByManagerUserId,
           es.pay_rate_per_hour AS PayRatePerHour,
           CASE WHEN es.pay_rate_per_hour IS NULL THEN e.cost_per_hour ELSE NULL END AS DefaultPayRate,
           es.overtime_rate_per_hour AS OvertimeRatePerHour,
           es.travel_refund AS TravelRefund,
           es.bonus_amount AS BonusAmount,
           es.penalty_amount AS PenaltyAmount,
           es.payment_status AS PaymentStatus,
           es.status AS Status
    FROM Employee_Shift es
    INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
    INNER JOIN Employee e ON e.user_ID = es.employee_user_ID
    INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
    INNER JOIN Roll r ON r.Roll_ID = s.roll_ID
    WHERE s.event_ID = @eventId
      AND es.status = 'manager_approved'
    ORDER BY u.lastName, u.firstName, s.start_time;
END
GO

CREATE OR ALTER PROCEDURE sp_GetPayrollItem
    @shiftId        NVARCHAR(64),
    @employeeUserId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT u.user_ID AS EmployeeUserId, u.FBUID AS EmployeeFbUid,
           u.firstName AS FirstName, u.lastName AS LastName,
           es.shift_ID AS ShiftId, r.Roll_name AS RoleName,
           s.start_time AS ShiftStart, s.end_time AS ShiftEnd,
           es.actual_start_time AS ActualStart, es.actual_end_time AS ActualEnd,
           s.bulk_actual_start_time AS ShiftBulkStart, s.bulk_actual_end_time AS ShiftBulkEnd,
           es.manager_actual_start_time AS ManagerOverrideStart, es.manager_actual_end_time AS ManagerOverrideEnd,
           CASE
               WHEN es.is_manager_hours_override = 1 THEN 'manager_override'
               WHEN s.bulk_actual_start_time IS NOT NULL OR s.bulk_actual_end_time IS NOT NULL THEN 'shift_bulk'
               WHEN es.actual_start_time IS NOT NULL OR es.actual_end_time IS NOT NULL THEN 'employee_report'
               ELSE 'none'
           END AS HoursSource,
           es.approved_regular_hours AS ApprovedRegularHours,
           es.approved_overtime_hours AS ApprovedOvertimeHours,
           es.approved_at AS ApprovedAt,
           es.approved_by_manager_user_ID AS ApprovedByManagerUserId,
           es.pay_rate_per_hour AS PayRatePerHour,
           CASE WHEN es.pay_rate_per_hour IS NULL THEN e.cost_per_hour ELSE NULL END AS DefaultPayRate,
           es.overtime_rate_per_hour AS OvertimeRatePerHour,
           es.travel_refund AS TravelRefund,
           es.bonus_amount AS BonusAmount,
           es.penalty_amount AS PenaltyAmount,
           es.payment_status AS PaymentStatus,
           es.status AS Status
    FROM Employee_Shift es
    INNER JOIN [User] u ON u.user_ID = es.employee_user_ID
    INNER JOIN Employee e ON e.user_ID = es.employee_user_ID
    INNER JOIN Shift s ON s.Shift_ID = es.shift_ID
    INNER JOIN Roll r ON r.Roll_ID = s.roll_ID
    WHERE es.shift_ID = @shiftId
      AND es.employee_user_ID = @employeeUserId;
END
GO

CREATE OR ALTER PROCEDURE sp_ApproveHours
    @shiftId        NVARCHAR(64),
    @employeeUserId NVARCHAR(64),
    @regularHours   DECIMAL(18, 2) = NULL,
    @overtimeHours  DECIMAL(18, 2) = NULL,
    @managerId      NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Employee_Shift
    SET approved_regular_hours = @regularHours,
        approved_overtime_hours = @overtimeHours,
        approved_by_manager_user_ID = @managerId,
        approved_at = GETUTCDATE(),
        status_updated_at = GETUTCDATE()
    WHERE shift_ID = @shiftId
      AND employee_user_ID = @employeeUserId;

    IF @@ROWCOUNT = 0
        RETURN;

    EXEC sp_GetPayrollItem @shiftId = @shiftId, @employeeUserId = @employeeUserId;
END
GO

CREATE OR ALTER PROCEDURE sp_SavePayroll
    @shiftId        NVARCHAR(64),
    @employeeUserId NVARCHAR(64),
    @payRate        DECIMAL(18, 2) = NULL,
    @overtimeRate   DECIMAL(18, 2) = NULL,
    @travel         DECIMAL(18, 2) = NULL,
    @bonus          DECIMAL(18, 2) = NULL,
    @penalty        DECIMAL(18, 2) = NULL,
    @paymentStatus  NVARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Employee_Shift
    SET pay_rate_per_hour = @payRate,
        overtime_rate_per_hour = @overtimeRate,
        travel_refund = @travel,
        bonus_amount = @bonus,
        penalty_amount = @penalty,
        payment_status = @paymentStatus,
        status_updated_at = GETUTCDATE()
    WHERE shift_ID = @shiftId
      AND employee_user_ID = @employeeUserId;

    IF @@ROWCOUNT = 0
        RETURN;

    EXEC sp_GetPayrollItem @shiftId = @shiftId, @employeeUserId = @employeeUserId;
END
GO

CREATE OR ALTER PROCEDURE sp_GetEventIdByShift
    @shiftId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT event_ID
    FROM Shift
    WHERE Shift_ID = @shiftId;
END
GO

CREATE OR ALTER PROCEDURE sp_SetShiftBulkHours
    @shiftId     NVARCHAR(64),
    @bulkStart   DATETIME2 = NULL,
    @bulkEnd     DATETIME2 = NULL,
    @managerId   NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    UPDATE Shift
    SET bulk_actual_start_time = @bulkStart,
        bulk_actual_end_time = @bulkEnd
    WHERE Shift_ID = @shiftId;

    IF @@ROWCOUNT = 0
    BEGIN
        ROLLBACK TRANSACTION;
        SELECT 0 AS RowsAffected;
        RETURN;
    END

    IF @bulkStart IS NOT NULL AND @bulkEnd IS NOT NULL
    BEGIN
        UPDATE Employee_Shift
        SET approved_regular_hours = ROUND(CAST(DATEDIFF(MINUTE, @bulkStart, @bulkEnd) AS DECIMAL(18, 2)) / 60.0, 2),
            approved_overtime_hours = NULL,
            approved_at = GETUTCDATE(),
            approved_by_manager_user_ID = @managerId,
            status_updated_at = GETUTCDATE()
        WHERE shift_ID = @shiftId
          AND is_manager_hours_override = 0
          AND status = 'manager_approved'
          AND ISNULL(payment_status, '') <> 'paid';
    END
    ELSE
    BEGIN
        UPDATE Employee_Shift
        SET approved_regular_hours = NULL,
            approved_overtime_hours = NULL,
            approved_at = NULL,
            approved_by_manager_user_ID = NULL,
            status_updated_at = GETUTCDATE()
        WHERE shift_ID = @shiftId
          AND is_manager_hours_override = 0
          AND status = 'manager_approved'
          AND ISNULL(payment_status, '') <> 'paid';
    END

    COMMIT TRANSACTION;
    SELECT 1 AS RowsAffected;
END
GO

CREATE OR ALTER PROCEDURE sp_SetEmployeeHoursOverride
    @shiftId        NVARCHAR(64),
    @employeeUserId NVARCHAR(64),
    @eventId        NVARCHAR(64),
    @clearOverride  BIT,
    @managerStart   DATETIME2 = NULL,
    @managerEnd     DATETIME2 = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @clearOverride = 1
    BEGIN
        UPDATE Employee_Shift
        SET manager_actual_start_time = NULL,
            manager_actual_end_time = NULL,
            is_manager_hours_override = 0,
            approved_regular_hours = NULL,
            approved_overtime_hours = NULL,
            approved_at = NULL,
            approved_by_manager_user_ID = NULL,
            status_updated_at = GETUTCDATE()
        WHERE shift_ID = @shiftId
          AND employee_user_ID = @employeeUserId
          AND status = 'manager_approved'
          AND ISNULL(payment_status, '') <> 'paid'
          AND EXISTS (
              SELECT 1
              FROM Shift s
              WHERE s.Shift_ID = @shiftId
                AND s.event_ID = @eventId
          );
    END
    ELSE
    BEGIN
        UPDATE Employee_Shift
        SET manager_actual_start_time = @managerStart,
            manager_actual_end_time = @managerEnd,
            is_manager_hours_override = 1,
            approved_regular_hours = NULL,
            approved_overtime_hours = NULL,
            approved_at = NULL,
            approved_by_manager_user_ID = NULL,
            status_updated_at = GETUTCDATE()
        WHERE shift_ID = @shiftId
          AND employee_user_ID = @employeeUserId
          AND status = 'manager_approved'
          AND ISNULL(payment_status, '') <> 'paid'
          AND EXISTS (
              SELECT 1
              FROM Shift s
              WHERE s.Shift_ID = @shiftId
                AND s.event_ID = @eventId
          );
    END

    IF @@ROWCOUNT = 0
        RETURN;

    EXEC sp_GetPayrollItem @shiftId = @shiftId, @employeeUserId = @employeeUserId;
END
GO
