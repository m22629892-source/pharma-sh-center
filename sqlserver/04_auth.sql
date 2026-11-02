USE [PharmaSHCenter];
GO
-- Additional server-side authentication table, SQL Server 2008 compatible.
IF OBJECT_ID(N'dbo.ServerAuthSessions',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.ServerAuthSessions (
   UserId nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
   TokenHash varchar(64) NOT NULL UNIQUE,
   ExpiresAt datetime2(3) NOT NULL,
   CreatedAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
   LastSeenAt datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
   FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
 );
END;
GO
