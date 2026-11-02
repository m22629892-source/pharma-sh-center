USE PharmaSHCenter;
GO
-- All orphan references are reported, never silently deleted or assigned to a different person.
SELECT 'DispenseMedicine' AS Issue, d.Id, d.medicineId AS MissingId FROM dbo.DispenseRecords d LEFT JOIN dbo.Medicines m ON d.medicineId COLLATE Latin1_General_100_BIN2=m.Id WHERE d.medicineId IS NOT NULL AND m.Id IS NULL
UNION ALL
SELECT 'DispenseResident',d.Id,d.residentId FROM dbo.DispenseRecords d LEFT JOIN dbo.Residents r ON d.residentId COLLATE Latin1_General_100_BIN2=r.Id WHERE d.residentId IS NOT NULL AND r.Id IS NULL
UNION ALL
SELECT 'DispenseDoctor',d.Id,d.doctorId FROM dbo.DispenseRecords d LEFT JOIN dbo.Doctors r ON d.doctorId COLLATE Latin1_General_100_BIN2=r.Id WHERE d.doctorId IS NOT NULL AND r.Id IS NULL
UNION ALL
SELECT 'BehaviorResident',b.Id,b.residentId FROM dbo.BehaviorLogs b LEFT JOIN dbo.Residents r ON b.residentId COLLATE Latin1_General_100_BIN2=r.Id WHERE b.residentId IS NOT NULL AND r.Id IS NULL;
SELECT Id,quantity,price FROM dbo.Medicines WHERE quantity<0 OR price<0;
SELECT Id,email,RequiresPasswordReset FROM dbo.Users;
SELECT 'Medicines' AS TableName,COUNT_BIG(*) AS Documents FROM dbo.Medicines
UNION ALL SELECT 'Residents',COUNT_BIG(*) FROM dbo.Residents
UNION ALL SELECT 'Doctors',COUNT_BIG(*) FROM dbo.Doctors
UNION ALL SELECT 'DispenseRecords',COUNT_BIG(*) FROM dbo.DispenseRecords;
