-- Source commit c9576695098f4eea2e861fe1601e8d35081e1878
-- SQL Server 2008 / 2008 R2 (including Express); execute with SSMS or sqlcmd.
USE [master];
GO
IF DB_ID(N'PharmaSHCenter') IS NULL CREATE DATABASE [PharmaSHCenter];
GO
USE [PharmaSHCenter];
GO
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.Medicines', N'U') IS NULL
CREATE TABLE dbo.[Medicines] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [commercialName] nvarchar(500) NULL,
  [commercialNameAr] nvarchar(500) NULL,
  [commercialNameEn] nvarchar(500) NULL,
  [scientificName] nvarchar(500) NULL,
  [quantity] decimal(19,4) NULL,
  [entryDate] date NULL,
  [expiryDate] date NULL,
  [price] decimal(19,4) NULL,
  [unit] nvarchar(500) NULL,
  [category] nvarchar(500) NULL,
  [createdAt] datetimeoffset(3) NULL,
  [updatedAt] datetimeoffset(3) NULL,
  [manufacturer] nvarchar(500) NULL,
  [isControlled] bit NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.DispenseRecords', N'U') IS NULL
CREATE TABLE dbo.[DispenseRecords] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [medicineId] nvarchar(500) NULL,
  [medicineName] nvarchar(500) NULL,
  [medicineNameEn] nvarchar(500) NULL,
  [residentId] nvarchar(500) NULL,
  [residentName] nvarchar(500) NULL,
  [residentNameEn] nvarchar(500) NULL,
  [quantityDispensed] decimal(19,4) NULL,
  [unit] nvarchar(500) NULL,
  [totalPrice] decimal(19,4) NULL,
  [actualQuantityDispensed] decimal(19,4) NULL,
  [dispensedBy] nvarchar(500) NULL,
  [dispensedById] nvarchar(500) NULL,
  [dispensedAt] datetimeoffset(3) NULL,
  [doctorId] nvarchar(500) NULL,
  [doctorName] nvarchar(500) NULL,
  [doctorNameEn] nvarchar(500) NULL,
  [doctorSpecialty] nvarchar(500) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.Doctors', N'U') IS NULL
CREATE TABLE dbo.[Doctors] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [nameAr] nvarchar(500) NULL,
  [nameEn] nvarchar(500) NULL,
  [specialty] nvarchar(500) NULL,
  [phone] nvarchar(500) NULL,
  [email] nvarchar(500) NULL,
  [createdAt] datetimeoffset(3) NULL,
  [updatedAt] datetimeoffset(3) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.Residents', N'U') IS NULL
CREATE TABLE dbo.[Residents] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [name] nvarchar(500) NULL,
  [nameAr] nvarchar(500) NULL,
  [nameEn] nvarchar(500) NULL,
  [birthDate] date NULL,
  [referralDate] date NULL,
  [referralFacility] nvarchar(500) NULL,
  [referralReason] nvarchar(max) NULL,
  [roomNumber] nvarchar(500) NULL,
  [wing] nvarchar(500) NULL,
  [nationalId] nvarchar(500) NULL,
  [age] int NULL,
  [notes] nvarchar(max) NULL,
  [allergies] nvarchar(max) NULL,
  [bloodGroup] nvarchar(500) NULL,
  [attendingPhysician] nvarchar(500) NULL,
  [chronicDiseases] nvarchar(max) NULL,
  [createdAt] datetimeoffset(3) NULL,
  [updatedAt] datetimeoffset(3) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.PharmaceuticalCompanies', N'U') IS NULL
CREATE TABLE dbo.[PharmaceuticalCompanies] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [name] nvarchar(500) NULL,
  [country] nvarchar(500) NULL,
  [contactPerson] nvarchar(500) NULL,
  [phone] nvarchar(500) NULL,
  [email] nvarchar(500) NULL,
  [notes] nvarchar(max) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.BehaviorLogs', N'U') IS NULL
CREATE TABLE dbo.[BehaviorLogs] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [residentId] nvarchar(500) NULL,
  [residentName] nvarchar(500) NULL,
  [loggedAt] datetimeoffset(3) NULL,
  [loggedBy] nvarchar(500) NULL,
  [behaviorRating] nvarchar(500) NULL,
  [severity] nvarchar(500) NULL,
  [recentMedicineId] nvarchar(500) NULL,
  [recentMedicineName] nvarchar(500) NULL,
  [notes] nvarchar(max) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.StockAuditLogs', N'U') IS NULL
CREATE TABLE dbo.[StockAuditLogs] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [medicineId] nvarchar(500) NULL,
  [medicineName] nvarchar(500) NULL,
  [actionType] nvarchar(500) NULL,
  [quantityChanged] decimal(19,4) NULL,
  [previousQuantity] decimal(19,4) NULL,
  [newQuantity] decimal(19,4) NULL,
  [performedByName] nvarchar(500) NULL,
  [performedByEmail] nvarchar(500) NULL,
  [performedById] nvarchar(500) NULL,
  [notes] nvarchar(max) NULL,
  [timestamp] datetimeoffset(3) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
CREATE TABLE dbo.[Users] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [uid] nvarchar(500) NULL,
  [name] nvarchar(500) NULL,
  [email] nvarchar(500) NULL,
  [role] nvarchar(500) NULL,
  [phone] nvarchar(500) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  [PasswordHash] nvarchar(512) NULL,
  [RequiresPasswordReset] bit NOT NULL DEFAULT 1
);
IF OBJECT_ID(N'dbo.UserSessions', N'U') IS NULL
CREATE TABLE dbo.[UserSessions] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [userId] nvarchar(500) NULL,
  [name] nvarchar(500) NULL,
  [email] nvarchar(500) NULL,
  [ipAddress] nvarchar(500) NULL,
  [deviceToken] nvarchar(max) NULL,
  [loginTime] datetimeoffset(3) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.ActiveSessions', N'U') IS NULL
CREATE TABLE dbo.[ActiveSessions] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [sessionId] nvarchar(500) NULL,
  [userId] nvarchar(500) NULL,
  [userName] nvarchar(500) NULL,
  [userEmail] nvarchar(500) NULL,
  [userRole] nvarchar(500) NULL,
  [ipAddress] nvarchar(500) NULL,
  [userAgent] nvarchar(max) NULL,
  [loginTime] datetimeoffset(3) NULL,
  [lastHeartbeat] datetimeoffset(3) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.SecuritySettings', N'U') IS NULL
CREATE TABLE dbo.[SecuritySettings] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [emailEnabled] bit NULL,
  [appsScriptUrl] nvarchar(max) NULL,
  [notificationEmail] nvarchar(max) NULL,
  [whatsAppEnabled] bit NULL,
  [whatsAppMode] nvarchar(500) NULL,
  [whatsAppNumber] nvarchar(max) NULL,
  [callMeBotApiKey] nvarchar(max) NULL,
  [ultraMsgInstance] nvarchar(500) NULL,
  [ultraMsgToken] nvarchar(max) NULL,
  [waPilotBaseUrl] nvarchar(max) NULL,
  [waPilotApiKey] nvarchar(max) NULL,
  [waPilotType] nvarchar(500) NULL,
  [waPilotDevice] nvarchar(500) NULL,
  [waPilotPath] nvarchar(max) NULL,
  [alertDays] int NULL,
  [updatedAt] datetimeoffset(3) NULL,
  [updatedBy] nvarchar(500) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.Settings', N'U') IS NULL
CREATE TABLE dbo.[Settings] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.SystemSettings', N'U') IS NULL
CREATE TABLE dbo.[SystemSettings] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.ItemUnits', N'U') IS NULL
CREATE TABLE dbo.[ItemUnits] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [name] nvarchar(500) NULL,
  [createdAt] datetimeoffset(3) NULL,
  [updatedAt] datetimeoffset(3) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.TherapeuticCategories', N'U') IS NULL
CREATE TABLE dbo.[TherapeuticCategories] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [name] nvarchar(500) NULL,
  [createdAt] datetimeoffset(3) NULL,
  [updatedAt] datetimeoffset(3) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.CustomSideEffects', N'U') IS NULL
CREATE TABLE dbo.[CustomSideEffects] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [key] nvarchar(500) NULL,
  [label] nvarchar(500) NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.Batches', N'U') IS NULL
CREATE TABLE dbo.[Batches] (
  [Id] nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL PRIMARY KEY,
  [batchNumber] nvarchar(500) NULL,
  [medicineId] nvarchar(500) NULL,
  [quantity] decimal(19,4) NULL,
  [expiryDate] date NULL,
  [entryDate] date NULL,
  [SourceJson] nvarchar(max) NOT NULL,
  [ImportedAt] datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
IF OBJECT_ID(N'dbo.ResidentDosageSchedule', N'U') IS NULL
CREATE TABLE dbo.ResidentDosageSchedule (
 ResidentId nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL,
 Id nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL,
 medicineId nvarchar(500) NULL, medicineName nvarchar(500) NULL,
 timeSlot nvarchar(50) NULL, dosage nvarchar(max) NULL, quantity decimal(19,4) NULL,
 checkedToday bit NULL, checkedBy nvarchar(500) NULL, checkedAt datetimeoffset(3) NULL,
 SourceJson nvarchar(max) NOT NULL,
 CONSTRAINT CK_Dosage_KeyBytes CHECK (DATALENGTH(ResidentId) + DATALENGTH(Id) <= 900),
 PRIMARY KEY (ResidentId,Id),
 FOREIGN KEY (ResidentId) REFERENCES dbo.Residents(Id)
);
IF OBJECT_ID(N'dbo.BehaviorLogSideEffects', N'U') IS NULL
CREATE TABLE dbo.BehaviorLogSideEffects (
 BehaviorLogId nvarchar(450) COLLATE Latin1_General_100_BIN2 NOT NULL,
 Ordinal int NOT NULL, EffectKey nvarchar(500) NOT NULL,
 CONSTRAINT CK_SideEffects_KeyBytes CHECK (DATALENGTH(BehaviorLogId) + 4 <= 900),
 PRIMARY KEY (BehaviorLogId,Ordinal),
 FOREIGN KEY (BehaviorLogId) REFERENCES dbo.BehaviorLogs(Id)
);
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
 DECLARE @SchemaError nvarchar(2048);
 SET @SchemaError = ERROR_MESSAGE();
 RAISERROR(N'%s', 16, 1, @SchemaError);
END CATCH;
GO
