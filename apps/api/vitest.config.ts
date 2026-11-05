import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: 'postgres://botiq_app:botiq_app_dev@localhost:5432/botiq_test',
      MIGRATE_DATABASE_URL: 'postgres://botiq_owner:botiq_owner_dev@localhost:5432/botiq_test',
      SESSION_COOKIE_SECURE: 'false',
    },
  },
});
