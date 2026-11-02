USE [PharmaSHCenter];
GO
-- Opt-in plaintext credential mode. Existing column and values are preserved.
IF COL_LENGTH(N'dbo.Users', N'password') IS NULL
    ALTER TABLE dbo.Users ADD [password] nvarchar(200) NULL;
GO
-- No existing password hashes can be converted back to plaintext.
-- If passwords were excluded from an earlier import, initialize them locally.
