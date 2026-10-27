-- VetConnect Maule · esquema PostgreSQL 15
-- (La app también lo crea al iniciar vía SQLAlchemy; este script sirve para despliegues manuales.)
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL
                  CHECK (role IN ('ADMIN','RECEPCIONISTA','VETERINARIO','TUTOR')),
    full_name     VARCHAR(150) NOT NULL,
    phone         VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS doctors (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id),
    specialty  VARCHAR(100) NOT NULL,
    box_number INTEGER NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS appointments (
    id         SERIAL PRIMARY KEY,
    doctor_id  INTEGER NOT NULL REFERENCES doctors(id),
    tutor_id   INTEGER NOT NULL REFERENCES users(id),
    status     VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED'
               CHECK (status IN ('CONFIRMED','ARRIVED','COMPLETED','CANCELLED')),
    start_time TIMESTAMP NOT NULL,
    end_time   TIMESTAMP NOT NULL,
    CONSTRAINT ck_appointment_range CHECK (end_time > start_time),

    -- REGLA CLAVE: un mismo médico no puede tener dos citas CONFIRMED con rangos
    -- superpuestos. La BD lo garantiza aunque dos requests lleguen en el mismo instante.
    -- tsrange usa límites [) → 09:00-09:30 y 09:30-10:00 NO se consideran solapadas.
    CONSTRAINT no_overlapping_confirmed_appointments
        EXCLUDE USING gist (
            doctor_id WITH =,
            tsrange(start_time, end_time) WITH &&
        ) WHERE (status IN ('CONFIRMED','ARRIVED'))
);

CREATE TABLE IF NOT EXISTS medical_records (
    id              SERIAL PRIMARY KEY,
    appointment_id   INTEGER NOT NULL UNIQUE REFERENCES appointments(id),
    pet_name        VARCHAR(100) NOT NULL,
    species         VARCHAR(50) NOT NULL DEFAULT 'Canino',
    weight_kg       DECIMAL(5,2) NOT NULL,
    antecedents      TEXT NOT NULL,
    vaccines        TEXT NOT NULL,
    diagnosis       TEXT NOT NULL,
    treatment       TEXT NOT NULL,
    prescription    TEXT NOT NULL,
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
