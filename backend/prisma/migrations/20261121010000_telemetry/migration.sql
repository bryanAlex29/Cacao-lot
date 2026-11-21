CREATE TYPE "TelemetrySource" AS ENUM ('real', 'demo');
CREATE TYPE "DataQuality" AS ENUM ('valid', 'missing', 'invalid', 'uncalibrated');
ALTER TABLE "devices" ADD COLUMN "source" "TelemetrySource" NOT NULL DEFAULT 'real',
  ADD COLUMN "expected_interval_seconds" INTEGER NOT NULL DEFAULT 60 CHECK ("expected_interval_seconds" BETWEEN 1 AND 86400);
CREATE TABLE "readings" (
  "id" UUID NOT NULL PRIMARY KEY,
  "device_id" UUID NOT NULL REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "event_id" VARCHAR(120) NOT NULL,
  "payload_hash" VARCHAR(64) NOT NULL,
  "recorded_at" TIMESTAMPTZ(3),
  "received_at" TIMESTAMPTZ(3) NOT NULL,
  "effective_at" TIMESTAMPTZ(3) NOT NULL,
  "ingestion_order" BIGSERIAL NOT NULL,
  "timestamp_origin" VARCHAR(6) NOT NULL CHECK ("timestamp_origin" IN ('device', 'server')),
  "source" "TelemetrySource" NOT NULL,
  "temperature_c" DOUBLE PRECISION,
  "air_humidity_pct" DOUBLE PRECISION,
  "rain_detected" BOOLEAN,
  "relay_commanded_open" BOOLEAN,
  "feedback_open" BOOLEAN,
  "quality" JSONB NOT NULL
);
CREATE UNIQUE INDEX "readings_ingestion_order_key" ON "readings"("ingestion_order");
CREATE UNIQUE INDEX "readings_device_id_event_id_key" ON "readings"("device_id", "event_id");
CREATE INDEX "readings_device_id_source_effective_at_received_at_ingestion_idx" ON "readings"("device_id", "source", "effective_at" DESC, "received_at" DESC, "ingestion_order" DESC);
CREATE TABLE "soil_readings" (
  "id" UUID NOT NULL PRIMARY KEY,
  "reading_id" UUID NOT NULL REFERENCES "readings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sensor_id" UUID NOT NULL REFERENCES "sensors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "moisture_pct" DOUBLE PRECISION,
  "quality" "DataQuality" NOT NULL
);
CREATE UNIQUE INDEX "soil_readings_reading_id_sensor_id_key" ON "soil_readings"("reading_id", "sensor_id");
CREATE INDEX "soil_readings_sensor_id_idx" ON "soil_readings"("sensor_id");
