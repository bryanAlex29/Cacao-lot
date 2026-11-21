-- Initial additive migration; no deletion or reset of existing data.
CREATE SCHEMA IF NOT EXISTS "public";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'FARMER');
CREATE TYPE "DeviceStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'STALE', 'OFFLINE');
CREATE TYPE "SensorCode" AS ENUM ('soil_1', 'soil_2', 'soil_3', 'temperatureC', 'airHumidityPct', 'rainDetected');
CREATE TYPE "SensorVariable" AS ENUM ('SOIL_MOISTURE', 'TEMPERATURE', 'AIR_HUMIDITY', 'RAIN_DETECTED');
CREATE TYPE "SensorUnit" AS ENUM ('PERCENT', 'CELSIUS', 'BOOLEAN');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'FARMER',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_email_normalized" CHECK ("email" = lower(trim("email")))
);
CREATE TABLE "plots" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "location_label" VARCHAR(200) NOT NULL,
  "area_m2" DOUBLE PRECISION,
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "plots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plots_area_positive" CHECK ("area_m2" IS NULL OR ("area_m2" > 0 AND "area_m2" < 'Infinity'::float8))
);
CREATE TABLE "devices" (
  "id" UUID NOT NULL,
  "plot_id" UUID NOT NULL,
  "serial" VARCHAR(100) NOT NULL,
  "credential_hash" VARCHAR(64) NOT NULL,
  "status" "DeviceStatus" NOT NULL DEFAULT 'UNKNOWN',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_seen_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "sensors" (
  "id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "code" "SensorCode" NOT NULL,
  "variable" "SensorVariable" NOT NULL,
  "unit" "SensorUnit" NOT NULL,
  "zone" VARCHAR(1),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "calibration_metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sensors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensors_identity" CHECK (
    ("code" = 'soil_1' AND "variable" = 'SOIL_MOISTURE' AND "unit" = 'PERCENT' AND "zone" IS NOT DISTINCT FROM 'A') OR
    ("code" = 'soil_2' AND "variable" = 'SOIL_MOISTURE' AND "unit" = 'PERCENT' AND "zone" IS NOT DISTINCT FROM 'B') OR
    ("code" = 'soil_3' AND "variable" = 'SOIL_MOISTURE' AND "unit" = 'PERCENT' AND "zone" IS NOT DISTINCT FROM 'C') OR
    ("code" = 'temperatureC' AND "variable" = 'TEMPERATURE' AND "unit" = 'CELSIUS' AND "zone" IS NULL) OR
    ("code" = 'airHumidityPct' AND "variable" = 'AIR_HUMIDITY' AND "unit" = 'PERCENT' AND "zone" IS NULL) OR
    ("code" = 'rainDetected' AND "variable" = 'RAIN_DETECTED' AND "unit" = 'BOOLEAN' AND "zone" IS NULL)
  )
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "plots_owner_id_archived_at_idx" ON "plots"("owner_id", "archived_at");
CREATE UNIQUE INDEX "devices_serial_key" ON "devices"("serial");
CREATE INDEX "devices_plot_id_idx" ON "devices"("plot_id");
CREATE UNIQUE INDEX "sensors_device_id_code_key" ON "sensors"("device_id", "code");
ALTER TABLE "plots" ADD CONSTRAINT "plots_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devices" ADD CONSTRAINT "devices_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
