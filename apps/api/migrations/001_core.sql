-- Núcleo SaaS: planes, hoteles (tenants), usuarios, membresías, sesiones, auditoría.
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS citext;

-- Contexto de tenant por transacción (set_config(..., true)). Sin contexto => 0 filas (falla cerrado).
CREATE FUNCTION app_hotel_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.hotel_id', true), '')::uuid $$;
CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
CREATE FUNCTION app_is_platform() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('app.platform', true), '') = 'on' $$;

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  price_usd_cents_month integer NOT NULL CHECK (price_usd_cents_month >= 0),
  max_rooms integer NOT NULL CHECK (max_rooms > 0),
  max_staff integer NOT NULL CHECK (max_staff > 0),
  features jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL,
  country text NOT NULL DEFAULT 'TZ',
  city text,
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  currencies text[] NOT NULL DEFAULT ARRAY['USD','TZS'],
  web_languages text[] NOT NULL DEFAULT ARRAY['ro','en','es','it','fr'],
  admin_language text NOT NULL DEFAULT 'ro',
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','suspended','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Suscripción SIMULADA: no hay cobro ni pasarela conectada.
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id),
  status text NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing','active','past_due','cancelled')),
  period_start date NOT NULL DEFAULT current_date,
  period_end date NOT NULL DEFAULT (current_date + 30),
  simulated boolean NOT NULL DEFAULT true CHECK (simulated),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  locale text NOT NULL DEFAULT 'ro',
  is_platform_admin boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','manager','receptionist','housekeeping','maintenance','accountant')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, user_id)
);

-- Solo se guarda el hash SHA-256 del token de sesión.
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

-- Auditoría append-only: la aplicación solo tiene INSERT/SELECT.
CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  hotel_id uuid REFERENCES hotels(id),
  user_id uuid,
  action text NOT NULL,
  entity text,
  entity_id text,
  data jsonb NOT NULL DEFAULT '{}',
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_hotel_idx ON audit_log(hotel_id, created_at DESC);

-- ===== Row-Level Security =====
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;  ALTER TABLE hotels FORCE ROW LEVEL SECURITY;
CREATE POLICY hotels_read ON hotels FOR SELECT USING (
  id = app_hotel_id() OR app_is_platform()
  OR EXISTS (SELECT 1 FROM memberships m WHERE m.hotel_id = hotels.id AND m.user_id = app_user_id()));
CREATE POLICY hotels_write ON hotels FOR ALL USING (app_is_platform()) WITH CHECK (app_is_platform());

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;  ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subs_read ON subscriptions FOR SELECT USING (hotel_id = app_hotel_id() OR app_is_platform());
CREATE POLICY subs_write ON subscriptions FOR ALL USING (app_is_platform()) WITH CHECK (app_is_platform());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;  ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memb_read ON memberships FOR SELECT USING (
  hotel_id = app_hotel_id() OR user_id = app_user_id() OR app_is_platform());
CREATE POLICY memb_write ON memberships FOR ALL USING (hotel_id = app_hotel_id() OR app_is_platform())
  WITH CHECK (hotel_id = app_hotel_id() OR app_is_platform());

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;  ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON audit_log FOR SELECT USING (hotel_id = app_hotel_id() OR app_is_platform());
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (
  hotel_id IS NULL OR hotel_id = app_hotel_id() OR app_is_platform());

-- ===== Permisos del rol de aplicación =====
GRANT USAGE ON SCHEMA public TO botiq_app;
GRANT SELECT ON plans TO botiq_app;
GRANT SELECT, INSERT, UPDATE ON hotels, subscriptions TO botiq_app;
GRANT SELECT, INSERT, UPDATE ON users TO botiq_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships, sessions TO botiq_app;
GRANT SELECT, INSERT ON audit_log TO botiq_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO botiq_app;
