export function sqlConfig(env: NodeJS.ProcessEnv = process.env) {
  const server = env.DB_SERVER?.trim();
  if (!server || server.includes('\\') || !env.DB_DATABASE || !env.DB_USER || !env.DB_PASSWORD) {
    throw new Error('Set DB_SERVER (host only), DB_INSTANCE or DB_PORT, DB_DATABASE, DB_USER and DB_PASSWORD in .env.');
  }
  if (env.DB_PORT && env.DB_INSTANCE) throw new Error('Choose DB_INSTANCE or DB_PORT, not both.');
  const port = env.DB_PORT ? Number(env.DB_PORT) : undefined;
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error('Invalid DB_PORT.');
  const tdsVersion = env.DB_TDS_VERSION || '7_3_A';
  if (!['7_3_A', '7_3_B', '7_4'].includes(tdsVersion)) throw new Error('Invalid DB_TDS_VERSION.');
  return {
    server, database: env.DB_DATABASE, user: env.DB_USER, password: env.DB_PASSWORD,
    ...(port ? { port } : {}),
    options: {
      ...(env.DB_INSTANCE ? { instanceName: env.DB_INSTANCE } : {}),
      encrypt: env.DB_ENCRYPT === 'true', trustServerCertificate: env.DB_TRUST_CERTIFICATE === 'true',
      tdsVersion: tdsVersion as '7_3_A' | '7_3_B' | '7_4', useUTC: true,
      appName: 'PharmaSHCenter', abortTransactionOnError: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000, requestTimeout: 30000,
  };
}
