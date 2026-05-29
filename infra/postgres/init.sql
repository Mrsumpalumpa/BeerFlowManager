-- ─────────────────────────────────────────────────────────────
-- BeerFlow — Schema inicial
-- ─────────────────────────────────────────────────────────────

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ──────────────────────────────
-- tap-management-service
-- ──────────────────────────────

CREATE TABLE IF NOT EXISTS kegs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(100) NOT NULL,
    beer_style  VARCHAR(100),
    capacity_ml INTEGER NOT NULL,
    remaining_ml INTEGER NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS taps (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tap_code        VARCHAR(50) UNIQUE NOT NULL,   -- ej. "tap-001"
    name            VARCHAR(100),
    keg_id          UUID REFERENCES kegs(id),
    price_per_ml    NUMERIC(10, 4) NOT NULL,        -- precio en €/ml
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────
-- billing-service
-- ──────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(200),
    rfid_token      VARCHAR(100) UNIQUE,            -- token RFID/QR
    balance         NUMERIC(10, 2) DEFAULT 0.00,    -- saldo prepago en €
    email           VARCHAR(200),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID REFERENCES customers(id),
    tap_id          UUID REFERENCES taps(id),
    ml_served       NUMERIC(10, 2) NOT NULL DEFAULT 0,
    price_per_ml    NUMERIC(10, 4) NOT NULL,
    total_amount    NUMERIC(10, 2),
    status          VARCHAR(20) DEFAULT 'open',    -- open | closed | paid | cancelled
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ
);

-- ──────────────────────────────
-- Datos de ejemplo para desarrollo
-- ──────────────────────────────

INSERT INTO kegs (id, name, beer_style, capacity_ml, remaining_ml)
VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Barril IPA', 'IPA', 30000, 28500),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'Barril Lager', 'Lager', 50000, 49000)
ON CONFLICT DO NOTHING;

INSERT INTO taps (tap_code, name, keg_id, price_per_ml)
VALUES
    ('tap-001', 'Grifo 1 — IPA', 'aaaaaaaa-0000-0000-0000-000000000001', 0.0065),
    ('tap-002', 'Grifo 2 — Lager', 'aaaaaaaa-0000-0000-0000-000000000002', 0.0045)
ON CONFLICT DO NOTHING;

INSERT INTO customers (name, rfid_token, balance, email)
VALUES
    ('Cliente Demo', 'demo-token-001', 20.00, 'demo@beerflow.io'),
    ('Cliente QR', 'qr-token-abc123', 15.00, 'qr@beerflow.io')
ON CONFLICT DO NOTHING;
