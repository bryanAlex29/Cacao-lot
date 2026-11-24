CREATE TABLE "ai_diagnoses" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "plot_id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "payload_hash" VARCHAR(64) NOT NULL,
  "provider" VARCHAR(32) NOT NULL DEFAULT 'mock',
  "status" VARCHAR(16) NOT NULL,
  "image_key" VARCHAR(64),
  "mime_type" VARCHAR(32) NOT NULL DEFAULT 'image/jpeg',
  "notes" VARCHAR(1000),
  "result" JSONB,
  "error_code" VARCHAR(32),
  "consent_version" VARCHAR(32) NOT NULL,
  "consent_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "deleted_at" TIMESTAMPTZ(3),
  CONSTRAINT "ai_diagnoses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_diagnoses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_diagnoses_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ai_diagnoses_status_check" CHECK ("status" IN ('pending','completed','failed')),
  CONSTRAINT "ai_diagnoses_provider_check" CHECK ("provider" = 'mock'),
  CONSTRAINT "ai_diagnoses_expiry_check" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "ai_diagnoses_user_id_request_id_key" ON "ai_diagnoses"("user_id", "request_id");
CREATE INDEX "ai_diagnoses_user_id_created_at_idx" ON "ai_diagnoses"("user_id", "created_at");
CREATE INDEX "ai_diagnoses_plot_id_created_at_id_idx" ON "ai_diagnoses"("plot_id", "created_at" DESC, "id" DESC);
CREATE INDEX "ai_diagnoses_expires_at_idx" ON "ai_diagnoses"("expires_at");
