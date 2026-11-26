CREATE TABLE "prediction_model_versions" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "plot_id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "sensor_id" UUID NOT NULL,
  "source" "TelemetrySource" NOT NULL,
  "version" VARCHAR(40) NOT NULL,
  "report_hash" VARCHAR(64) NOT NULL,
  "dataset_hash" VARCHAR(64) NOT NULL,
  "input_hash" VARCHAR(64) NOT NULL,
  "artifact_hash" VARCHAR(64) NOT NULL,
  "artifact" JSONB NOT NULL,
  "evaluation" JSONB NOT NULL,
  "trained_until" TIMESTAMPTZ(3) NOT NULL,
  "evaluated_through" TIMESTAMPTZ(3) NOT NULL,
  "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "prediction_model_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prediction_models_dates" CHECK ("trained_until" < "evaluated_through" AND "evaluated_through" <= "registered_at"),
  CONSTRAINT "prediction_models_version" CHECK ("version" = 'linear-two-lag-1.0.0'),
  CONSTRAINT "prediction_models_hashes" CHECK (
    "report_hash" ~ '^[a-f0-9]{64}$' AND "dataset_hash" ~ '^[a-f0-9]{64}$'
    AND "input_hash" ~ '^[a-f0-9]{64}$' AND "artifact_hash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "prediction_models_json" CHECK (jsonb_typeof("artifact") = 'object' AND jsonb_typeof("evaluation") = 'object'),
  CONSTRAINT "prediction_model_versions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prediction_model_versions_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prediction_model_versions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prediction_model_versions_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "prediction_model_versions_sensor_id_report_hash_key" ON "prediction_model_versions"("sensor_id", "report_hash");
CREATE INDEX "prediction_models_selection_idx" ON "prediction_model_versions"("device_id", "source", "sensor_id", "enabled", "registered_at" DESC);
