-- Módulo PMS. Toda tabla tiene hotel_id; las FK son compuestas (hotel_id, id) para que
-- una fila de un hotel NUNCA pueda referenciar datos de otro hotel.
CREATE TABLE room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  max_adults integer NOT NULL DEFAULT 2 CHECK (max_adults > 0),
  max_children integer NOT NULL DEFAULT 0 CHECK (max_children >= 0),
  base_rate_cents integer NOT NULL CHECK (base_rate_cents >= 0),
  UNIQUE (hotel_id, id),
  UNIQUE (hotel_id, name)
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  number text NOT NULL,
  floor integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','out_of_service')),
  housekeeping_status text NOT NULL DEFAULT 'clean' CHECK (housekeeping_status IN ('clean','dirty','in_progress','inspected')),
  UNIQUE (hotel_id, id),
  UNIQUE (hotel_id, number),
  FOREIGN KEY (hotel_id, room_type_id) REFERENCES room_types(hotel_id, id)
);

-- Tarifas por temporada: [start_date, end_date). Sin solapes por tipo de habitación.
CREATE TABLE rate_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  CHECK (end_date > start_date),
  UNIQUE (hotel_id, id),
  FOREIGN KEY (hotel_id, room_type_id) REFERENCES room_types(hotel_id, id),
  EXCLUDE USING gist (room_type_id WITH =, daterange(start_date, end_date, '[)') WITH &&)
);

CREATE TABLE guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  country text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, id)
);

CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  code text NOT NULL,
  guest_id uuid NOT NULL,
  room_id uuid NOT NULL,
  room_type_id uuid NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  adults integer NOT NULL DEFAULT 1 CHECK (adults > 0),
  children integer NOT NULL DEFAULT 0 CHECK (children >= 0),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  source text NOT NULL DEFAULT 'direct' CHECK (source IN ('direct','web','phone','walk_in','booking_com','airbnb','other')),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  CHECK (check_out > check_in),
  UNIQUE (hotel_id, id),
  UNIQUE (hotel_id, code),
  FOREIGN KEY (hotel_id, guest_id) REFERENCES guests(hotel_id, id),
  FOREIGN KEY (hotel_id, room_id) REFERENCES rooms(hotel_id, id),
  FOREIGN KEY (hotel_id, room_type_id) REFERENCES room_types(hotel_id, id),
  -- Garantía final contra doble reserva, incluso con peticiones concurrentes.
  EXCLUDE USING gist (room_id WITH =, daterange(check_in, check_out, '[)') WITH &&)
    WHERE (status IN ('pending','confirmed','checked_in'))
);
CREATE INDEX reservations_dates_idx ON reservations(hotel_id, check_in, check_out);

-- Pagos SIMULADOS: el CHECK impide guardar un pago "real" hasta que exista una integración verificada.
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  method text NOT NULL CHECK (method IN ('cash','card_simulated','transfer')),
  simulated boolean NOT NULL DEFAULT true CHECK (simulated),
  reference text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (hotel_id, reservation_id) REFERENCES reservations(hotel_id, id)
);

-- Excursiones, transfers y otros extras cargados a la reserva.
CREATE TABLE extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('excursion','transfer','restaurant','other')),
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  service_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (hotel_id, reservation_id) REFERENCES reservations(hotel_id, id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['room_types','rooms','rate_periods','guests','reservations','payments','extras'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (hotel_id = app_hotel_id() OR app_is_platform()) WITH CHECK (hotel_id = app_hotel_id() OR app_is_platform())', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON room_types, rooms, rate_periods, guests, extras TO botiq_app;
GRANT SELECT, INSERT, UPDATE ON reservations TO botiq_app;
-- Los pagos son un libro contable: sin UPDATE ni DELETE (las correcciones son reembolsos).
GRANT SELECT, INSERT ON payments TO botiq_app;
