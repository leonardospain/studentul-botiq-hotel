export const config = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://botiq_app:botiq_app_dev@localhost:5432/botiq',
  migrateUrl: process.env.MIGRATE_DATABASE_URL ?? 'postgres://botiq_owner:botiq_owner_dev@localhost:5432/botiq',
  port: Number(process.env.PORT ?? 3000),
  cookieSecure: process.env.SESSION_COOKIE_SECURE === 'true',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:3000').split(',').map((s) => s.trim()),
  sessionDays: 7,
  isProduction: process.env.NODE_ENV === 'production',
};
