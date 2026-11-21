-- Additive only: existing sensors, telemetry and calibration remain unchanged.
CREATE UNIQUE INDEX "sensors_id_variable_unit_key" ON "sensors"("id", "variable", "unit");

CREATE TABLE "sensor_thresholds" (
  "id" UUID NOT NULL,
  "sensor_id" UUID NOT NULL,
  "variable" "SensorVariable" NOT NULL,
  "unit" "SensorUnit" NOT NULL,
  "min_value" DOUBLE PRECISION NOT NULL,
  "max_value" DOUBLE PRECISION NOT NULL,
  "hysteresis" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "effective_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_by" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  CONSTRAINT "sensor_thresholds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensor_thresholds_order" CHECK ("min_value" < "max_value"),
  CONSTRAINT "sensor_thresholds_supported_range" CHECK (
    ("variable" IN ('SOIL_MOISTURE', 'AIR_HUMIDITY') AND "unit" = 'PERCENT' AND "min_value" >= 0 AND "max_value" <= 100) OR
    ("variable" = 'TEMPERATURE' AND "unit" = 'CELSIUS' AND "min_value" >= -50 AND "max_value" <= 100)
  ),
  -- Reserved for a later alerting increment; this API does not configure hysteresis.
  CONSTRAINT "sensor_thresholds_hysteresis" CHECK ("hysteresis" = 0),
  CONSTRAINT "sensor_thresholds_version" CHECK ("version" > 0),
  CONSTRAINT "sensor_thresholds_sensor_id_variable_unit_fkey" FOREIGN KEY ("sensor_id", "variable", "unit") REFERENCES "sensors"("id", "variable", "unit") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "sensor_thresholds_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sensor_thresholds_sensor_id_variable_key" ON "sensor_thresholds"("sensor_id", "variable");

CREATE TABLE "sensor_threshold_audits" (
  "id" UUID NOT NULL,
  "sensor_id" UUID NOT NULL,
  "plot_id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "source" "TelemetrySource" NOT NULL,
  "variable" "SensorVariable" NOT NULL,
  "old_value" JSONB,
  "new_value" JSONB NOT NULL,
  "version" INTEGER NOT NULL,
  "changed_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "sensor_threshold_audits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sensor_threshold_audits_version" CHECK ("version" > 0),
  CONSTRAINT "sensor_threshold_audits_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sensor_threshold_audits_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sensor_threshold_audits_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "sensor_threshold_audits_sensor_id_variable_version_key" ON "sensor_threshold_audits"("sensor_id", "variable", "version");
CREATE INDEX "sensor_threshold_audits_plot_id_changed_at_idx" ON "sensor_threshold_audits"("plot_id", "changed_at");
