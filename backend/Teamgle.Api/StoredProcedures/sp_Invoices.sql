-- =============================================================================
-- File:        sp_Invoices.sql
-- Project:     Teamgle - Workforce Management Platform
-- Description: Stored Procedures for the Invoice module.
--
-- HOW TO USE:
--   UP   section  →  run once to create / update all procedures.
--   DOWN section  →  run to drop all procedures (rollback, at bottom of file).
--
-- Access control pattern:
--   Invoice has no company_ID column.
--   Company isolation is enforced via:  Invoice → Customer → company_ID
--   All SPs resolve the caller's company from their Firebase UID via [User]+Manager.
-- =============================================================================


-- =============================================================================
-- SCHEMA  —  Create Invoice table if it doesn't exist
--            Run this before the stored procedures below.
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Invoice')
BEGIN
    CREATE TABLE Invoice (
        invoice_ID     NVARCHAR(50)   NOT NULL PRIMARY KEY,
        event_ID       NVARCHAR(50)   NULL,
        project_ID     NVARCHAR(50)   NULL,
        customer_ID    NVARCHAR(50)   NOT NULL,
        invoice_number NVARCHAR(100)  NOT NULL,
        invoice_date   DATE           NOT NULL,
        due_date       DATE           NOT NULL,
        invoice_amount DECIMAL(18,2)  NOT NULL,
        paid_amount    DECIMAL(18,2)  NOT NULL DEFAULT 0,
        payment_status NVARCHAR(50)   NOT NULL DEFAULT 'draft',
        payment_date   DATE           NULL,
        created_at     DATETIME2      NOT NULL DEFAULT GETDATE(),
        notes          NVARCHAR(MAX)  NULL,
        CONSTRAINT FK_Invoice_Customer FOREIGN KEY (customer_ID) REFERENCES Customer(customer_ID),
        CONSTRAINT FK_Invoice_Project  FOREIGN KEY (project_ID)  REFERENCES Project(Proj_ID),
        CONSTRAINT FK_Invoice_Event    FOREIGN KEY (event_ID)    REFERENCES [Event](event_ID),
        CONSTRAINT CHK_Invoice_Status  CHECK (payment_status IN ('draft','sent','partial','paid','overdue','cancelled'))
    );
END;
GO


-- =============================================================================
-- UP  —  Create (or replace) all stored procedures
-- =============================================================================


-- =============================================================================
-- Description:  sp_GetInvoicesByManagerCompany
--               Returns all invoices visible to the manager (company-scoped).
--               Access: Invoice → Customer.company_ID = manager's company.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetInvoicesByManagerCompany
    @managerFBUID NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @managerFBUID;

    IF @companyId IS NULL
    BEGIN
        RAISERROR('User is not a registered manager.', 16, 1);
        RETURN;
    END

    SELECT
        i.invoice_ID,
        i.event_ID,
        i.project_ID,
        i.customer_ID,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.invoice_amount,
        ISNULL(i.paid_amount, 0)           AS paid_amount,
        i.payment_status,
        i.payment_date,
        i.created_at,
        i.notes,
        c.customer_company_name,
        p.name                             AS project_name,
        e.name                             AS event_name
    FROM   Invoice   i
    INNER JOIN Customer c ON i.customer_ID = c.customer_ID
    LEFT  JOIN Project  p ON i.project_ID  = p.Proj_ID
    LEFT  JOIN [Event]  e ON i.event_ID    = e.event_ID
    WHERE  c.company_ID = @companyId
    ORDER  BY i.created_at DESC;
END;
GO


-- =============================================================================
-- Description:  sp_GetInvoiceById
--               Returns a single invoice if it belongs to the manager's company.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetInvoiceById
    @invoiceId    NVARCHAR(50),
    @managerFBUID NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @managerFBUID;

    IF @companyId IS NULL
    BEGIN
        RAISERROR('User is not a registered manager.', 16, 1);
        RETURN;
    END

    SELECT
        i.invoice_ID,
        i.event_ID,
        i.project_ID,
        i.customer_ID,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.invoice_amount,
        ISNULL(i.paid_amount, 0)           AS paid_amount,
        i.payment_status,
        i.payment_date,
        i.created_at,
        i.notes,
        c.customer_company_name,
        p.name                             AS project_name,
        e.name                             AS event_name
    FROM   Invoice   i
    INNER JOIN Customer c ON i.customer_ID = c.customer_ID
    LEFT  JOIN Project  p ON i.project_ID  = p.Proj_ID
    LEFT  JOIN [Event]  e ON i.event_ID    = e.event_ID
    WHERE  i.invoice_ID = @invoiceId
      AND  c.company_ID = @companyId;
END;
GO


-- =============================================================================
-- Description:  sp_CreateInvoice
--               Inserts a new invoice.
--               - If @eventId is provided: derives project_ID and customer_ID
--                 from Event → Project → Customer.
--               - If @projectId provided (no event): derives customer_ID from
--                 Project → Customer.
--               - @customerId can also be passed explicitly.
--               Access verified: derived/provided customer must belong to manager's company.
--               Sets created_at = GETDATE(), defaults paid_amount = 0.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_CreateInvoice
    @invoiceId     NVARCHAR(50),
    @managerFBUID  NVARCHAR(128),
    @eventId       NVARCHAR(50)   = NULL,
    @projectId     NVARCHAR(50)   = NULL,
    @customerId    NVARCHAR(50)   = NULL,
    @invoiceNumber NVARCHAR(100),
    @invoiceDate   DATE,
    @dueDate       DATE,
    @invoiceAmount DECIMAL(18,2),
    @paymentStatus NVARCHAR(50)   = 'draft',
    @notes         NVARCHAR(MAX)  = NULL
AS
BEGIN
    SET NOCOUNT ON;

    -- Resolve manager's company
    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @managerFBUID;

    IF @companyId IS NULL
    BEGIN
        RAISERROR('User is not a registered manager.', 16, 1);
        RETURN;
    END

    -- Derive project_ID from event if not supplied
    IF @eventId IS NOT NULL AND @projectId IS NULL
    BEGIN
        SELECT @projectId = project_ID FROM [Event] WHERE event_ID = @eventId;
        IF @projectId IS NULL
        BEGIN
            RAISERROR('Event not found or has no associated project.', 16, 1);
            RETURN;
        END
    END

    -- Cross-validate: if both eventId and projectId supplied, event must belong to project
    IF @eventId IS NOT NULL AND @projectId IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM [Event] WHERE event_ID = @eventId AND project_ID = @projectId)
        BEGIN
            RAISERROR('Event does not belong to the specified project.', 16, 1);
            RETURN;
        END
    END

    -- Derive customer_ID from project if not supplied
    IF @projectId IS NOT NULL AND @customerId IS NULL
    BEGIN
        SELECT @customerId = customer_ID FROM Project WHERE Proj_ID = @projectId;
        IF @customerId IS NULL
        BEGIN
            RAISERROR('Project not found or has no associated customer.', 16, 1);
            RETURN;
        END
    END

    -- Cross-validate: if both projectId and customerId supplied, project must belong to customer
    IF @projectId IS NOT NULL AND @customerId IS NOT NULL
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM Project WHERE Proj_ID = @projectId AND customer_ID = @customerId)
        BEGIN
            RAISERROR('Project does not belong to the specified customer.', 16, 1);
            RETURN;
        END
    END

    IF @customerId IS NULL
    BEGIN
        RAISERROR('A customer must be specified directly or derivable from event/project.', 16, 1);
        RETURN;
    END

    -- Verify the customer belongs to the manager's company
    IF NOT EXISTS (
        SELECT 1 FROM Customer
        WHERE customer_ID = @customerId AND company_ID = @companyId
    )
    BEGIN
        RAISERROR('Customer does not belong to your company.', 16, 1);
        RETURN;
    END

    -- Validate status
    IF @paymentStatus NOT IN ('draft','sent','partial','paid','overdue','cancelled')
        SET @paymentStatus = 'draft';

    INSERT INTO Invoice
        (invoice_ID, event_ID, project_ID, customer_ID,
         invoice_number, invoice_date, due_date,
         invoice_amount, paid_amount,
         payment_status, payment_date, created_at, notes)
    VALUES
        (@invoiceId, @eventId, @projectId, @customerId,
         @invoiceNumber, @invoiceDate, @dueDate,
         @invoiceAmount, 0,
         @paymentStatus, NULL, GETDATE(), @notes);

    -- Return the created invoice
    EXEC sp_GetInvoiceById @invoiceId, @managerFBUID;
END;
GO


-- =============================================================================
-- Description:  sp_UpdateInvoice
--               Updates editable fields on an existing invoice.
--               Access: invoice's customer must belong to manager's company.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_UpdateInvoice
    @invoiceId     NVARCHAR(50),
    @managerFBUID  NVARCHAR(128),
    @invoiceNumber NVARCHAR(100),
    @invoiceDate   DATE,
    @dueDate       DATE,
    @invoiceAmount DECIMAL(18,2),
    @paymentStatus NVARCHAR(50) = NULL,
    @notes         NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @managerFBUID;

    IF @companyId IS NULL
    BEGIN
        RAISERROR('User is not a registered manager.', 16, 1);
        RETURN;
    END

    -- Verify access
    IF NOT EXISTS (
        SELECT 1
        FROM Invoice i
        INNER JOIN Customer c ON i.customer_ID = c.customer_ID
        WHERE i.invoice_ID = @invoiceId AND c.company_ID = @companyId
    )
    BEGIN
        RAISERROR('Invoice not found or access denied.', 16, 1);
        RETURN;
    END

    UPDATE Invoice
    SET
        invoice_number = @invoiceNumber,
        invoice_date   = @invoiceDate,
        due_date       = @dueDate,
        invoice_amount = @invoiceAmount,
        payment_status = ISNULL(@paymentStatus, payment_status),
        notes          = @notes
    WHERE invoice_ID = @invoiceId;

    EXEC sp_GetInvoiceById @invoiceId, @managerFBUID;
END;
GO


-- =============================================================================
-- Description:  sp_RecordInvoicePayment
--               Updates paid_amount, payment_date, and recalculates status.
--               If @paymentStatus is not supplied (NULL), the SP auto-calculates:
--                 - paid >= invoice_amount  → 'paid'
--                 - paid > 0               → 'partial'
--                 - due_date < today       → 'overdue'
--                 - else                  → 'sent'
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_RecordInvoicePayment
    @invoiceId    NVARCHAR(50),
    @managerFBUID NVARCHAR(128),
    @paidAmount   DECIMAL(18,2),
    @paymentDate  DATE          = NULL,
    @paymentStatus NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @managerFBUID;

    IF @companyId IS NULL
    BEGIN
        RAISERROR('User is not a registered manager.', 16, 1);
        RETURN;
    END

    -- Verify access and load current invoice data
    DECLARE @invoiceAmount DECIMAL(18,2), @dueDate DATE, @currentStatus NVARCHAR(50);
    SELECT
        @invoiceAmount  = i.invoice_amount,
        @dueDate        = i.due_date,
        @currentStatus  = i.payment_status
    FROM Invoice i
    INNER JOIN Customer c ON i.customer_ID = c.customer_ID
    WHERE i.invoice_ID = @invoiceId AND c.company_ID = @companyId;

    IF @invoiceAmount IS NULL
    BEGIN
        RAISERROR('Invoice not found or access denied.', 16, 1);
        RETURN;
    END

    -- Auto-calculate status if not explicitly provided
    IF @paymentStatus IS NULL OR @paymentStatus NOT IN ('draft','sent','partial','paid','overdue','cancelled')
    BEGIN
        IF @paidAmount >= @invoiceAmount
            SET @paymentStatus = 'paid';
        ELSE IF @paidAmount > 0
            SET @paymentStatus = 'partial';
        ELSE IF @dueDate < CAST(GETDATE() AS DATE)
            SET @paymentStatus = 'overdue';
        ELSE
            SET @paymentStatus = 'sent';
    END

    IF @paymentDate IS NULL
        SET @paymentDate = CAST(GETDATE() AS DATE);

    UPDATE Invoice
    SET
        paid_amount    = @paidAmount,
        payment_date   = @paymentDate,
        payment_status = @paymentStatus
    WHERE invoice_ID = @invoiceId;

    EXEC sp_GetInvoiceById @invoiceId, @managerFBUID;
END;
GO


-- =============================================================================
-- Description:  sp_DeleteInvoice
--               Soft-cancels an invoice by setting payment_status = 'cancelled'.
--               Hard delete is intentionally not supported for audit integrity.
--               Returns 1 if cancelled, 0 if not found / access denied.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_DeleteInvoice
    @invoiceId    NVARCHAR(50),
    @managerFBUID NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @managerFBUID;

    IF @companyId IS NULL
    BEGIN
        SELECT 0 AS affected;
        RETURN;
    END

    UPDATE i
    SET i.payment_status = 'cancelled'
    FROM Invoice i
    INNER JOIN Customer c ON i.customer_ID = c.customer_ID
    WHERE i.invoice_ID = @invoiceId
      AND c.company_ID = @companyId
      AND i.payment_status <> 'cancelled';

    SELECT @@ROWCOUNT AS affected;
END;
GO


-- =============================================================================
-- Description:  sp_GetInvoicesByProject
--               Returns all invoices for a specific project, company-scoped.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetInvoicesByProject
    @projectId    NVARCHAR(50),
    @managerFBUID NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @managerFBUID;

    IF @companyId IS NULL
    BEGIN
        RAISERROR('User is not a registered manager.', 16, 1);
        RETURN;
    END

    SELECT
        i.invoice_ID,
        i.event_ID,
        i.project_ID,
        i.customer_ID,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.invoice_amount,
        ISNULL(i.paid_amount, 0)           AS paid_amount,
        i.payment_status,
        i.payment_date,
        i.created_at,
        i.notes,
        c.customer_company_name,
        p.name                             AS project_name,
        e.name                             AS event_name
    FROM   Invoice   i
    INNER JOIN Customer c ON i.customer_ID = c.customer_ID
    LEFT  JOIN Project  p ON i.project_ID  = p.Proj_ID
    LEFT  JOIN [Event]  e ON i.event_ID    = e.event_ID
    WHERE  i.project_ID  = @projectId
      AND  c.company_ID  = @companyId
    ORDER  BY i.created_at DESC;
END;
GO


-- =============================================================================
-- Description:  sp_GetInvoicesByEvent
--               Returns all invoices for a specific event, company-scoped.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetInvoicesByEvent
    @eventId      NVARCHAR(50),
    @managerFBUID NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @managerFBUID;

    IF @companyId IS NULL
    BEGIN
        RAISERROR('User is not a registered manager.', 16, 1);
        RETURN;
    END

    SELECT
        i.invoice_ID,
        i.event_ID,
        i.project_ID,
        i.customer_ID,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.invoice_amount,
        ISNULL(i.paid_amount, 0)           AS paid_amount,
        i.payment_status,
        i.payment_date,
        i.created_at,
        i.notes,
        c.customer_company_name,
        p.name                             AS project_name,
        e.name                             AS event_name
    FROM   Invoice   i
    INNER JOIN Customer c ON i.customer_ID = c.customer_ID
    LEFT  JOIN Project  p ON i.project_ID  = p.Proj_ID
    LEFT  JOIN [Event]  e ON i.event_ID    = e.event_ID
    WHERE  i.event_ID    = @eventId
      AND  c.company_ID  = @companyId
    ORDER  BY i.created_at DESC;
END;
GO


-- =============================================================================
-- Description:  sp_GetInvoicesByCustomer
--               Returns all invoices for a specific customer, company-scoped.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetInvoicesByCustomer
    @customerId   NVARCHAR(50),
    @managerFBUID NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @companyId NVARCHAR(50);
    SELECT @companyId = u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @managerFBUID;

    IF @companyId IS NULL
    BEGIN
        RAISERROR('User is not a registered manager.', 16, 1);
        RETURN;
    END

    SELECT
        i.invoice_ID,
        i.event_ID,
        i.project_ID,
        i.customer_ID,
        i.invoice_number,
        i.invoice_date,
        i.due_date,
        i.invoice_amount,
        ISNULL(i.paid_amount, 0)           AS paid_amount,
        i.payment_status,
        i.payment_date,
        i.created_at,
        i.notes,
        c.customer_company_name,
        p.name                             AS project_name,
        e.name                             AS event_name
    FROM   Invoice   i
    INNER JOIN Customer c ON i.customer_ID = c.customer_ID
    LEFT  JOIN Project  p ON i.project_ID  = p.Proj_ID
    LEFT  JOIN [Event]  e ON i.event_ID    = e.event_ID
    WHERE  i.customer_ID = @customerId
      AND  c.company_ID  = @companyId
    ORDER  BY i.created_at DESC;
END;
GO


-- =============================================================================
-- DOWN  —  Drop all stored procedures (rollback)
-- =============================================================================
/*
DROP PROCEDURE IF EXISTS sp_GetInvoicesByManagerCompany;
DROP PROCEDURE IF EXISTS sp_GetInvoiceById;
DROP PROCEDURE IF EXISTS sp_CreateInvoice;
DROP PROCEDURE IF EXISTS sp_UpdateInvoice;
DROP PROCEDURE IF EXISTS sp_RecordInvoicePayment;
DROP PROCEDURE IF EXISTS sp_DeleteInvoice;
DROP PROCEDURE IF EXISTS sp_GetInvoicesByProject;
DROP PROCEDURE IF EXISTS sp_GetInvoicesByEvent;
DROP PROCEDURE IF EXISTS sp_GetInvoicesByCustomer;
*/
