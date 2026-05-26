-- Event expenses stored procedures
-- Run each CREATE OR ALTER PROCEDURE batch separately if your SQL tool does not support GO.

CREATE OR ALTER PROCEDURE sp_GetEventExpenses
    @eventId NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT ee.expense_ID, ee.event_ID, ee.expense_type, ee.description,
           ee.amount, ee.expense_date, ee.vendor_name, ee.notes,
           ee.created_by_manager_user_ID,
           u.firstName + ' ' + u.lastName AS manager_name
    FROM Event_Expense ee
    LEFT JOIN [User] u ON u.user_ID = ee.created_by_manager_user_ID
    WHERE ee.event_ID = @eventId
    ORDER BY ee.expense_date DESC;
END
GO

CREATE OR ALTER PROCEDURE sp_CreateEventExpense
    @expenseId  NVARCHAR(64),
    @eventId    NVARCHAR(64),
    @type       NVARCHAR(100),
    @desc       NVARCHAR(MAX) = NULL,
    @amount     DECIMAL(18, 2) = NULL,
    @date       DATETIME2 = NULL,
    @vendor     NVARCHAR(255) = NULL,
    @firebaseUid NVARCHAR(255),
    @notes      NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO Event_Expense
        (expense_ID, event_ID, expense_type, description, amount, expense_date,
         vendor_name, created_by_manager_user_ID, notes)
    VALUES (
        @expenseId, @eventId, @type, @desc, @amount, @date, @vendor,
        (SELECT user_ID FROM [User] WHERE FBUID = @firebaseUid),
        @notes
    );

    SELECT ee.expense_ID, ee.event_ID, ee.expense_type, ee.description,
           ee.amount, ee.expense_date, ee.vendor_name, ee.notes,
           ee.created_by_manager_user_ID,
           u.firstName + ' ' + u.lastName AS manager_name
    FROM Event_Expense ee
    LEFT JOIN [User] u ON u.user_ID = ee.created_by_manager_user_ID
    WHERE ee.expense_ID = @expenseId;
END
GO

CREATE OR ALTER PROCEDURE sp_UpdateEventExpense
    @expenseId NVARCHAR(64),
    @eventId   NVARCHAR(64),
    @type      NVARCHAR(100),
    @desc      NVARCHAR(MAX) = NULL,
    @amount    DECIMAL(18, 2) = NULL,
    @date      DATETIME2 = NULL,
    @vendor    NVARCHAR(255) = NULL,
    @notes     NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Event_Expense
    SET expense_type = @type,
        description = @desc,
        amount = @amount,
        expense_date = @date,
        vendor_name = @vendor,
        notes = @notes
    WHERE expense_ID = @expenseId
      AND event_ID = @eventId;

    IF @@ROWCOUNT = 0
        RETURN;

    SELECT ee.expense_ID, ee.event_ID, ee.expense_type, ee.description,
           ee.amount, ee.expense_date, ee.vendor_name, ee.notes,
           ee.created_by_manager_user_ID,
           u.firstName + ' ' + u.lastName AS manager_name
    FROM Event_Expense ee
    LEFT JOIN [User] u ON u.user_ID = ee.created_by_manager_user_ID
    WHERE ee.expense_ID = @expenseId;
END
GO

CREATE OR ALTER PROCEDURE sp_DeleteEventExpense
    @expenseId NVARCHAR(64),
    @eventId   NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM Event_Expense
    WHERE expense_ID = @expenseId
      AND event_ID = @eventId;

    SELECT @@ROWCOUNT AS RowsAffected;
END
GO
