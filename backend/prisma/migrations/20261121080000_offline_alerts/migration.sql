-- Additive only: telemetry, ranges, credentials and existing data remain unchanged.
CREATE TABLE "offline_alerts" (
  "id" UUID NOT NULL,
  "device_id" UUID NOT NULL,
  "plot_id" UUID NOT NULL,
  "source" "TelemetrySource" NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "expected_interval_seconds" INTEGER NOT NULL,
  "detected_at" TIMESTAMPTZ(3) NOT NULL,
  "closed_at" TIMESTAMPTZ(3),
  "close_reason" VARCHAR(32),
  "acknowledged_at" TIMESTAMPTZ(3),
  "acknowledged_by" UUID,
  CONSTRAINT "offline_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "offline_alerts_interval" CHECK ("expected_interval_seconds" > 0),
  CONSTRAINT "offline_alerts_detection" CHECK ("detected_at" > "last_seen_at" + "expected_interval_seconds" * INTERVAL '5 seconds'),
  CONSTRAINT "offline_alerts_closure" CHECK (
    ("closed_at" IS NULL AND "close_reason" IS NULL) OR
    ("closed_at" IS NOT NULL AND "closed_at" >= "detected_at" AND "close_reason" IS NOT NULL AND
      "close_reason" IN ('CONTACT_RESTORED', 'MONITORING_STOPPED', 'INTERVAL_CHANGED'))
  ),
  CONSTRAINT "offline_alerts_acknowledgment" CHECK (
    ("acknowledged_at" IS NULL AND "acknowledged_by" IS NULL) OR
    ("acknowledged_at" IS NOT NULL AND "acknowledged_by" IS NOT NULL AND "acknowledged_at" >= "detected_at")
  ),
  CONSTRAINT "offline_alerts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "offline_alerts_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "offline_alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Prisma does not model partial unique indexes. Also protects against multiple detector processes.
CREATE UNIQUE INDEX "offline_alerts_one_active_device" ON "offline_alerts"("device_id") WHERE "closed_at" IS NULL;
CREATE INDEX "offline_alerts_page_idx" ON "offline_alerts"("plot_id", "source", "device_id", "detected_at" DESC, "id" DESC);
CREATE INDEX "offline_alerts_device_state_idx" ON "offline_alerts"("device_id", "closed_at");
