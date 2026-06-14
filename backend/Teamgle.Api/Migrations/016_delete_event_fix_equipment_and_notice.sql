-- 016_delete_event_fix_equipment_and_notice.sql
-- Fix sp_DeleteEvent:
--   1) BUG (500): it never deleted Shift_Equipment rows, so deleting an event
--      whose shifts had equipment violated FK_ShiftEquipment_Shift and threw.
--      (sp_DeleteProject already handled this; sp_DeleteEvent was missed when the
--      Shift_Equipment table was introduced in migration 013.)
--   2) Consistency: also emit Shift_Cancellation_Notice rows for the event's
--      manager-approved employees, so deleting a single event notifies workers
--      exactly like deleting a project does.

ALTER PROCEDURE sp_DeleteEvent
    @eventId      NVARCHAR(50),
    @managerFBUID NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM [User] u INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE u.FBUID = @managerFBUID;

    IF @companyId IS NULL BEGIN
        RAISERROR('User is not a registered manager.', 16, 1); RETURN;
    END

    IF NOT EXISTS (
        SELECT 1 FROM [Event] e
        INNER JOIN Manager_Project mp ON mp.project_ID = e.project_ID
        INNER JOIN [User] u ON u.user_ID = mp.manager_user_ID
        WHERE e.event_ID = @eventId AND u.company_ID = @companyId
    ) BEGIN
        RAISERROR('Event not found or access denied.', 16, 2); RETURN;
    END

    BEGIN TRANSACTION;
    BEGIN TRY
        -- Detach invoices
        UPDATE Invoice SET event_ID = NULL WHERE event_ID = @eventId;

        -- Null out shift refs in Briefs/Tasks not covered by event deletion
        UPDATE Brief SET shift_ID = NULL
        WHERE shift_ID IN (SELECT Shift_ID FROM Shift WHERE event_ID = @eventId);
        UPDATE Task SET shift_ID = NULL
        WHERE shift_ID IN (SELECT Shift_ID FROM Shift WHERE event_ID = @eventId);

        -- Cancellation notices for approved employees on this event's shifts
        INSERT INTO Shift_Cancellation_Notice
               (notice_ID, employee_user_ID, event_name, role_name,
                shift_start, shift_end, event_start, cancelled_at)
        SELECT NEWID(),
               es.employee_user_ID,
               ev.name,
               r.Roll_name,
               s.start_time,
               s.end_time,
               ev.start_time,
               GETUTCDATE()
        FROM Employee_Shift es
        INNER JOIN Shift s    ON s.Shift_ID   = es.shift_ID
        INNER JOIN [Event] ev ON ev.event_ID  = s.event_ID
        LEFT  JOIN Roll r     ON r.Roll_ID    = s.roll_ID
        WHERE s.event_ID = @eventId
          AND es.status  = 'manager_approved'
          AND (es.canceled IS NULL OR es.canceled = 0);

        -- Brief_Acknowledgment for this event's briefs
        DELETE ba FROM Brief_Acknowledgment ba
        INNER JOIN Brief b ON ba.brief_ID = b.brief_ID
        WHERE b.event_ID = @eventId;

        -- Employee_Shift for this event's shifts
        DELETE es FROM Employee_Shift es
        INNER JOIN Shift s ON es.shift_ID = s.Shift_ID
        WHERE s.event_ID = @eventId;

        -- Shift_Equipment for this event's shifts  (THE FK that caused the 500)
        DELETE se FROM Shift_Equipment se
        INNER JOIN Shift s ON se.shift_ID = s.Shift_ID
        WHERE s.event_ID = @eventId;

        -- Event_Expense
        DELETE FROM Event_Expense WHERE event_ID = @eventId;

        -- Tasks
        DELETE FROM Task WHERE event_ID = @eventId;

        -- Briefs
        DELETE FROM Brief WHERE event_ID = @eventId;

        -- Shifts
        DELETE FROM Shift WHERE event_ID = @eventId;

        -- Event
        DELETE FROM [Event] WHERE event_ID = @eventId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
