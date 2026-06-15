-- =============================================================================
-- File:        sp_Customers.sql
-- Project:     Teamgle - Workforce Management Platform
-- Description: Stored Procedures for the Customer and ContactPerson module.
--
-- HOW TO USE:
--   UP   section  →  run once to create / update all procedures.
--   DOWN section  →  run to drop all procedures (rollback, at bottom of file).
--
-- NOTE: Does NOT create or alter any tables.
-- =============================================================================


-- =============================================================================
-- UP  —  Create (or replace) all 11 stored procedures
-- =============================================================================


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_GetManagerCompanyId
--               Looks up the company_ID for a manager by their Firebase UID.
--               Returns one row with company_ID, or an empty result set if the
--               UID does not belong to a registered manager.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetManagerCompanyId
    @fbuid NVARCHAR(128)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT u.company_ID
    FROM   [User] u
    INNER JOIN Manager m ON u.user_ID = m.user_ID
    WHERE  u.FBUID = @fbuid;
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_GetCustomersByCompany
--               Returns a summary list of all customers that belong to the
--               given company, ordered by company name.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetCustomersByCompany
    @companyId NVARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT customer_ID,
           customer_company_name,
           company_phone,
           company_email,
           company_city,
           business_number,
           created_at
    FROM   Customer
    WHERE  company_ID = @companyId
    ORDER BY customer_company_name;
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_GetCustomerById
--               Returns all detail columns for a single customer.
--               The company_ID filter ensures a manager cannot read another
--               company's data (ownership check).
--               Returns an empty result set if not found or wrong company.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetCustomerById
    @customerId NVARCHAR(36),
    @companyId  NVARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT customer_ID,
           customer_company_name,
           company_phone,
           company_email,
           company_city,
           company_address,
           billing_email,
           business_number,
           payment_terms,
           notes,
           created_at
    FROM   Customer
    WHERE  customer_ID = @customerId
      AND  company_ID  = @companyId;
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_GetContactsByCustomer
--               Returns all contact persons for the given customer.
--               First verifies that the customer belongs to the caller's company.
--               Raises error with state=1 (→ KeyNotFoundException in C#) if the
--               customer is not found or belongs to a different company.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetContactsByCustomer
    @customerId NVARCHAR(36),
    @companyId  NVARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- Ownership check: make sure this customer belongs to the caller's company
        IF NOT EXISTS (
            SELECT 1 FROM Customer
            WHERE  customer_ID = @customerId AND company_ID = @companyId
        )
            RAISERROR('Customer not found.', 16, 1);   -- state 1 → KeyNotFoundException

        SELECT contact_ID,
               customer_company_ID,
               first_name,
               last_name,
               phone,
               email,
               job_title,
               is_primary,
               notes,
               created_at
        FROM   ContactPerson
        WHERE  customer_company_ID = @customerId
        ORDER BY is_primary DESC, first_name, last_name;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_GetContactById
--               Returns one contact person row.
--               Uses an INNER JOIN with Customer to enforce company ownership.
--               Returns an empty result set if not found or wrong company.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_GetContactById
    @contactId  NVARCHAR(36),
    @customerId NVARCHAR(36),
    @companyId  NVARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT cp.contact_ID,
           cp.customer_company_ID,
           cp.first_name,
           cp.last_name,
           cp.phone,
           cp.email,
           cp.job_title,
           cp.is_primary,
           cp.notes,
           cp.created_at
    FROM   ContactPerson cp
    INNER JOIN Customer c ON cp.customer_company_ID = c.customer_ID
    WHERE  cp.contact_ID          = @contactId
      AND  cp.customer_company_ID = @customerId
      AND  c.company_ID           = @companyId;
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_CreateCustomer
--               Inserts a new row into the Customer table.
--               The GUID (customer_ID) is generated by the C# repository
--               and passed in as a parameter.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_CreateCustomer
    @customerId     NVARCHAR(36),
    @name           NVARCHAR(200),
    @phone          NVARCHAR(50)  = NULL,
    @email          NVARCHAR(200) = NULL,
    @city           NVARCHAR(100) = NULL,
    @address        NVARCHAR(500) = NULL,
    @billingEmail   NVARCHAR(200) = NULL,
    @businessNumber NVARCHAR(50)  = NULL,
    @paymentTerms   NVARCHAR(100) = NULL,
    @notes          NVARCHAR(MAX) = NULL,
    @createdAt      DATETIME,
    @companyId      NVARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO Customer
        (customer_ID, customer_company_name, company_phone, company_email,
         company_city, company_address, billing_email, business_number,
         payment_terms, notes, created_at, company_ID)
    VALUES
        (@customerId, @name, @phone, @email,
         @city, @address, @billingEmail, @businessNumber,
         @paymentTerms, @notes, @createdAt, @companyId);
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_UpdateCustomer
--               Updates all editable fields for an existing customer.
--               The WHERE clause includes company_ID to prevent cross-company edits.
--               If no row was updated (@@ROWCOUNT = 0), raises error with state=2
--               (→ UnauthorizedAccessException in C#).
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_UpdateCustomer
    @customerId     NVARCHAR(36),
    @companyId      NVARCHAR(36),
    @name           NVARCHAR(200),
    @phone          NVARCHAR(50)  = NULL,
    @email          NVARCHAR(200) = NULL,
    @city           NVARCHAR(100) = NULL,
    @address        NVARCHAR(500) = NULL,
    @billingEmail   NVARCHAR(200) = NULL,
    @businessNumber NVARCHAR(50)  = NULL,
    @paymentTerms   NVARCHAR(100) = NULL,
    @notes          NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE Customer
    SET    customer_company_name = @name,
           company_phone         = @phone,
           company_email         = @email,
           company_city          = @city,
           company_address       = @address,
           billing_email         = @billingEmail,
           business_number       = @businessNumber,
           payment_terms         = @paymentTerms,
           notes                 = @notes
    WHERE  customer_ID = @customerId
      AND  company_ID  = @companyId;

    -- If no row was matched, the customer doesn't exist or belongs to another company
    IF @@ROWCOUNT = 0
        RAISERROR('Customer not found or access denied.', 16, 2);   -- state 2 → UnauthorizedAccessException
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_DeleteCustomer
--               Deletes a customer and ALL its contact persons inside a
--               single transaction (to keep data consistent).
--               The company_ID guard on the Customer DELETE prevents removing
--               a customer that belongs to a different company.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_DeleteCustomer
    @customerId NVARCHAR(36),
    @companyId  NVARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;

    -- Guard: block deletion if any invoices reference this customer (FK_Invoice_Customer).
    -- Even cancelled invoices must be preserved for audit / history.
    -- Checked BEFORE the transaction so RAISERROR + RETURN returns cleanly.
    -- State 3 → InvalidOperationException → 409 Conflict (handled, not a 500).
    IF EXISTS (SELECT 1 FROM Invoice WHERE customer_ID = @customerId)
    BEGIN
        RAISERROR('Cannot delete customer: one or more invoices exist for this customer. Remove all invoices first.', 16, 3);
        RETURN;
    END

    BEGIN TRANSACTION;
    BEGIN TRY
        -- Step 1: detach any projects that reference this customer
        UPDATE Project
        SET    customer_ID = NULL
        WHERE  customer_ID = @customerId;

        -- Step 2: delete all contact persons for this customer
        DELETE FROM ContactPerson
        WHERE  customer_company_ID = @customerId;

        -- Step 3: delete the customer (company_ID guard = ownership check)
        DELETE FROM Customer
        WHERE  customer_ID = @customerId
          AND  company_ID  = @companyId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_CreateContact
--               Inserts a new contact person for a customer.
--               Runs inside a transaction because it may involve multiple checks.
--               Raises state=1 (→ KeyNotFoundException)       if the customer is
--                 not found or does not belong to this company.
--               Raises state=3 (→ InvalidOperationException)  if a primary contact
--                 already exists and @isPrimary = 1.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_CreateContact
    @contactId  NVARCHAR(36),
    @customerId NVARCHAR(36),
    @companyId  NVARCHAR(36),
    @firstName  NVARCHAR(100),
    @lastName   NVARCHAR(100),
    @phone      NVARCHAR(50)  = NULL,
    @email      NVARCHAR(200) = NULL,
    @jobTitle   NVARCHAR(100) = NULL,
    @isPrimary  BIT,
    @notes      NVARCHAR(MAX) = NULL,
    @createdAt  DATETIME
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;
    BEGIN TRY
        -- Check 1: the customer must belong to the caller's company
        IF NOT EXISTS (
            SELECT 1 FROM Customer
            WHERE  customer_ID = @customerId AND company_ID = @companyId
        )
            RAISERROR('Customer not found.', 16, 1);   -- state 1 → KeyNotFoundException

        -- Check 2: only one primary contact is allowed per customer
        IF @isPrimary = 1 AND EXISTS (
            SELECT 1 FROM ContactPerson
            WHERE  customer_company_ID = @customerId AND is_primary = 1
        )
            RAISERROR('This customer already has a primary contact. Remove or unset the existing primary first.', 16, 3);   -- state 3 → InvalidOperationException

        INSERT INTO ContactPerson
            (contact_ID, customer_company_ID, first_name, last_name,
             phone, email, job_title, is_primary, notes, created_at)
        VALUES
            (@contactId, @customerId, @firstName, @lastName,
             @phone, @email, @jobTitle, @isPrimary, @notes, @createdAt);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_UpdateContact
--               Updates all editable fields on a contact person.
--               If @isPrimary = 1, first clears the is_primary flag on all other
--               contacts for the same customer (only one primary allowed).
--               Runs inside a transaction.
--               Raises state=2 (→ UnauthorizedAccessException) if the contact is
--               not found or does not belong to this company.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_UpdateContact
    @contactId  NVARCHAR(36),
    @customerId NVARCHAR(36),
    @companyId  NVARCHAR(36),
    @firstName  NVARCHAR(100),
    @lastName   NVARCHAR(100),
    @phone      NVARCHAR(50)  = NULL,
    @email      NVARCHAR(200) = NULL,
    @jobTitle   NVARCHAR(100) = NULL,
    @isPrimary  BIT,
    @notes      NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;
    BEGIN TRY
        -- Ownership check: contact must belong to the caller's company (via Customer JOIN)
        IF NOT EXISTS (
            SELECT 1
            FROM   ContactPerson cp
            INNER JOIN Customer c ON cp.customer_company_ID = c.customer_ID
            WHERE  cp.contact_ID          = @contactId
              AND  cp.customer_company_ID = @customerId
              AND  c.company_ID           = @companyId
        )
            RAISERROR('Contact not found or access denied.', 16, 2);   -- state 2 → UnauthorizedAccessException

        -- If this contact is being set as primary, clear the flag on all others first
        IF @isPrimary = 1
            UPDATE ContactPerson
            SET    is_primary = 0
            WHERE  customer_company_ID = @customerId;

        UPDATE ContactPerson
        SET    first_name = @firstName,
               last_name  = @lastName,
               phone      = @phone,
               email      = @email,
               job_title  = @jobTitle,
               is_primary = @isPrimary,
               notes      = @notes
        WHERE  contact_ID = @contactId;

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO


-- =============================================================================
-- Author:       Teamgle Dev
-- Create date:  2026-04-12
-- Description:  sp_DeleteContact
--               Deletes one contact person.
--               Verifies ownership via a Customer JOIN before deleting.
--               Raises state=2 (→ UnauthorizedAccessException) if the contact is
--               not found or does not belong to this company.
-- =============================================================================
CREATE OR ALTER PROCEDURE sp_DeleteContact
    @contactId  NVARCHAR(36),
    @customerId NVARCHAR(36),
    @companyId  NVARCHAR(36)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        -- Ownership check: contact must belong to the caller's company
        IF NOT EXISTS (
            SELECT 1
            FROM   ContactPerson cp
            INNER JOIN Customer c ON cp.customer_company_ID = c.customer_ID
            WHERE  cp.contact_ID          = @contactId
              AND  cp.customer_company_ID = @customerId
              AND  c.company_ID           = @companyId
        )
            RAISERROR('Contact not found or access denied.', 16, 2);   -- state 2 → UnauthorizedAccessException

        DELETE FROM ContactPerson
        WHERE  contact_ID = @contactId;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO


-- =============================================================================
-- DOWN  —  Drop all stored procedures added above.
--          Does NOT drop or alter any tables or data.
--          Uncomment and run to roll back.
-- =============================================================================
/*
DROP PROCEDURE IF EXISTS sp_GetManagerCompanyId;
DROP PROCEDURE IF EXISTS sp_GetCustomersByCompany;
DROP PROCEDURE IF EXISTS sp_GetCustomerById;
DROP PROCEDURE IF EXISTS sp_GetContactsByCustomer;
DROP PROCEDURE IF EXISTS sp_GetContactById;
DROP PROCEDURE IF EXISTS sp_CreateCustomer;
DROP PROCEDURE IF EXISTS sp_UpdateCustomer;
DROP PROCEDURE IF EXISTS sp_DeleteCustomer;
DROP PROCEDURE IF EXISTS sp_CreateContact;
DROP PROCEDURE IF EXISTS sp_UpdateContact;
DROP PROCEDURE IF EXISTS sp_DeleteContact;
*/
