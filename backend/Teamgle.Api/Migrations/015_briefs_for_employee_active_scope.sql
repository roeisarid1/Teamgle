-- 015_briefs_for_employee_active_scope.sql
-- Align sp_GetBriefsForEmployee with sp_GetEquipmentForEmployee and
-- sp_GetBriefAcknowledgments: an employee should only receive briefs for shifts
-- where they are an ACTIVE manager-approved worker.
--
-- Cancellation is modelled by the dedicated status 'manager_approved_canceled'
-- (the canceled column is currently always 0), so filtering status = 'manager_approved'
-- already excludes canceled assignments. The extra (canceled IS NULL OR canceled = 0)
-- guard is added purely for defense-in-depth / consistency with the sibling SPs, in
-- case the canceled column is ever populated against a row left at 'manager_approved'.

ALTER PROCEDURE sp_GetBriefsForEmployee
    @fbUid NVARCHAR(255)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT DISTINCT b.brief_ID, b.title, b.content, b.created_at,
        b.project_ID, b.event_ID, b.shift_ID,
        p.name AS ProjectName, e.name AS EventName,
        CAST(COALESCE(ba.is_read,0) AS bit) AS IsAcknowledged, ba.read_at AS AcknowledgedAt
    FROM Brief b
    LEFT JOIN Project p ON p.Proj_ID = b.project_ID
    LEFT JOIN Event e ON e.event_ID = b.event_ID
    INNER JOIN (
        SELECT DISTINCT s.event_ID, e2.project_ID, es.shift_ID, u.FBUID
        FROM Employee_Shift es INNER JOIN [User] u ON u.user_ID=es.employee_user_ID
        INNER JOIN Shift s ON s.Shift_ID=es.shift_ID INNER JOIN Event e2 ON e2.event_ID=s.event_ID
        WHERE u.FBUID=@fbUid
          AND es.status='manager_approved'
          AND (es.canceled IS NULL OR es.canceled = 0)
    ) emp ON (
        (b.project_ID IS NOT NULL AND b.project_ID=emp.project_ID)
        OR (b.event_ID IS NOT NULL AND b.event_ID=emp.event_ID)
        OR (b.shift_ID IS NOT NULL AND b.shift_ID=emp.shift_ID)
    )
    LEFT JOIN Brief_Acknowledgment ba ON ba.brief_ID=b.brief_ID
        AND ba.employee_user_ID=(SELECT user_ID FROM [User] WHERE FBUID=@fbUid)
    ORDER BY b.created_at DESC;
END
