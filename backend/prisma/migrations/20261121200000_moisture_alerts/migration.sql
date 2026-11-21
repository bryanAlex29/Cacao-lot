-- Additive: no default margins, no changes to threshold history, telemetry or offline alerts.
CREATE TABLE "moisture_alert_policies" (
  "sensor_id" UUID PRIMARY KEY REFERENCES "sensors"("id") ON DELETE RESTRICT,
  "recovery_margin_pct" DOUBLE PRECISION NOT NULL CHECK ("recovery_margin_pct" > 0 AND "recovery_margin_pct" <= 100),
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE TABLE "moisture_policy_audits" (
  "id" UUID PRIMARY KEY,
  "sensor_id" UUID NOT NULL REFERENCES "sensors"("id") ON DELETE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "old_value" JSONB,
  "new_value" JSONB NOT NULL,
  "changed_at" TIMESTAMPTZ(3) NOT NULL,
  UNIQUE ("sensor_id", "version")
);
CREATE TABLE "moisture_alert_states" (
  "sensor_id" UUID PRIMARY KEY REFERENCES "sensors"("id") ON DELETE RESTRICT,
  "policy_version" INTEGER NOT NULL CHECK ("policy_version" > 0),
  "threshold_version" INTEGER NOT NULL CHECK ("threshold_version" >= 0),
  "last_order" BIGINT NOT NULL CHECK ("last_order" >= 0),
  "last_effective_at" TIMESTAMPTZ(3),
  "low_count" INTEGER NOT NULL DEFAULT 0 CHECK ("low_count" BETWEEN 0 AND 2),
  "recovery_count" INTEGER NOT NULL DEFAULT 0 CHECK ("recovery_count" BETWEEN 0 AND 2),
  "first_low_at" TIMESTAMPTZ(3),
  CHECK (("low_count" = 0 AND "first_low_at" IS NULL) OR ("low_count" > 0 AND "first_low_at" IS NOT NULL)),
  CHECK ("low_count" = 0 OR "recovery_count" = 0)
);
CREATE TABLE "moisture_alerts" (
  "id" UUID PRIMARY KEY,
  "sensor_id" UUID NOT NULL REFERENCES "sensors"("id") ON DELETE RESTRICT,
  "device_id" UUID NOT NULL REFERENCES "devices"("id") ON DELETE RESTRICT,
  "plot_id" UUID NOT NULL REFERENCES "plots"("id") ON DELETE RESTRICT,
  "code" "SensorCode" NOT NULL CHECK ("code" IN ('soil_1','soil_2','soil_3')),
  "source" "TelemetrySource" NOT NULL,
  "min_value" DOUBLE PRECISION NOT NULL CHECK ("min_value" >= 0),
  "max_value" DOUBLE PRECISION NOT NULL CHECK ("max_value" <= 100),
  "recovery_margin_pct" DOUBLE PRECISION NOT NULL CHECK ("recovery_margin_pct" > 0),
  "threshold_version" INTEGER NOT NULL CHECK ("threshold_version" > 0),
  "policy_version" INTEGER NOT NULL CHECK ("policy_version" > 0),
  "first_low_at" TIMESTAMPTZ(3) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(3) NOT NULL,
  "trigger_value" DOUBLE PRECISION NOT NULL CHECK ("trigger_value" >= 0),
  "trigger_event_id" VARCHAR(120) NOT NULL,
  "detected_at" TIMESTAMPTZ(3) NOT NULL,
  "closed_at" TIMESTAMPTZ(3),
  "close_reason" VARCHAR(32),
  "acknowledged_at" TIMESTAMPTZ(3),
  "acknowledged_by" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
  CHECK ("min_value" < "max_value" AND "min_value" + "recovery_margin_pct" <= "max_value"),
  CHECK ("trigger_value" < "min_value"),
  CHECK ("first_low_at" < "confirmed_at" AND "confirmed_at" <= "detected_at"),
  CHECK (("closed_at" IS NULL AND "close_reason" IS NULL) OR
    ("closed_at" IS NOT NULL AND "closed_at" >= "detected_at" AND "close_reason" IS NOT NULL AND
      "close_reason" IN ('RECOVERED','CONFIGURATION_CHANGED','MONITORING_STOPPED'))),
  CHECK (("acknowledged_at" IS NULL AND "acknowledged_by" IS NULL) OR
    ("acknowledged_at" IS NOT NULL AND "acknowledged_at" >= "detected_at" AND "acknowledged_by" IS NOT NULL))
);
CREATE UNIQUE INDEX "moisture_alerts_one_active_sensor" ON "moisture_alerts"("sensor_id") WHERE "closed_at" IS NULL;
CREATE INDEX "moisture_alerts_page_idx" ON "moisture_alerts"("device_id", "source", "detected_at" DESC, "id" DESC);
CREATE INDEX "moisture_alerts_sensor_id_closed_at_idx" ON "moisture_alerts"("sensor_id", "closed_at");
CREATE INDEX "readings_device_ingestion_idx" ON "readings"("device_id", "ingestion_order");
