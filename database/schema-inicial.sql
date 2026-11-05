-- SGA: proposta inicial de schema PostgreSQL para os agentes de backend.
-- Não execute em produção sem revisar permissões, políticas de retenção e migrações.
CREATE TABLE IF NOT EXISTS app_users (
  firebase_uid TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS spaces (
  id UUID PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES app_users(firebase_uid),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Outro',
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES app_users(firebase_uid),
  full_name TEXT NOT NULL,
  role_name TEXT NOT NULL,
  contact_email TEXT,
  photo_url TEXT
);
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY,
  owner_uid TEXT NOT NULL REFERENCES app_users(firebase_uid),
  space_id UUID NOT NULL REFERENCES spaces(id),
  person_id UUID REFERENCES people(id),
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS bookings_owner_starts_idx ON bookings(owner_uid, starts_at);
-- Sobreposição de reservas e escopo por organização devem ser validados na API,
-- além de uma restrição transacional de concorrência antes de uso real.
