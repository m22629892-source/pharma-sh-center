SQL Server 2008 schema and authentication extension.

See [Arabic local setup guide](../SQLSERVER_SETUP_AR.md).

01_schema.sql creates missing application tables and does not delete existing data.
04_auth.sql adds the server-side session table to an existing migrated database.
03_validate.sql is read-only and reports selected missing references.

Do not commit exports, patient data, generated imports or service-account credentials.
