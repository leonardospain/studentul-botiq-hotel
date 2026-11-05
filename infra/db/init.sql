-- Roles y bases de datos para desarrollo/test. Idempotente. Ejecutar como superusuario.
-- botiq_owner: dueño del esquema (migraciones). botiq_app: usuario de la aplicación,
-- SIN superusuario y SIN BYPASSRLS, de modo que Row-Level Security siempre se aplica.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'botiq_owner') THEN
    CREATE ROLE botiq_owner LOGIN PASSWORD 'botiq_owner_dev' NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'botiq_app') THEN
    CREATE ROLE botiq_app LOGIN PASSWORD 'botiq_app_dev' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;
SELECT 'CREATE DATABASE botiq OWNER botiq_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='botiq')\gexec
SELECT 'CREATE DATABASE botiq_test OWNER botiq_owner' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='botiq_test')\gexec
