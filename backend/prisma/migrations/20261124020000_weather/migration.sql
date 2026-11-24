CREATE TABLE "weather_profiles" (
  "plot_id" UUID PRIMARY KEY REFERENCES "plots"("id") ON DELETE RESTRICT,
  "latitude" DOUBLE PRECISION NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
  "longitude" DOUBLE PRECISION NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
  "timezone" VARCHAR(64) NOT NULL CHECK ("timezone" IN ('America/Guayaquil', 'Pacific/Galapagos')),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "updated_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consent_at" TIMESTAMPTZ(3),
  "attempt_at" TIMESTAMPTZ(3),
  "synced_at" TIMESTAMPTZ(3),
  "last_error" VARCHAR(32),
  CHECK (NOT "enabled" OR "consent_at" IS NOT NULL)
);
CREATE TABLE "weather_batches" (
  "id" UUID PRIMARY KEY,
  "plot_id" UUID NOT NULL REFERENCES "weather_profiles"("plot_id") ON DELETE RESTRICT,
  "profile_version" INTEGER NOT NULL,
  "from_date" VARCHAR(10) NOT NULL,
  "to_date" VARCHAR(10) NOT NULL,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  "provenance" JSONB NOT NULL,
  "raw" JSONB NOT NULL
);
CREATE TABLE "weather_profile_revisions" (
  "id" UUID PRIMARY KEY,
  "plot_id" UUID NOT NULL REFERENCES "weather_profiles"("plot_id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "weather_profile_revisions_plot_id_version_key"
  ON "weather_profile_revisions"("plot_id", "version");
CREATE INDEX "weather_batches_plot_id_profile_version_fetched_at_idx"
  ON "weather_batches"("plot_id", "profile_version", "fetched_at" DESC);
CREATE TABLE "weather_observations" (
  "id" UUID PRIMARY KEY,
  "plot_id" UUID NOT NULL,
  "profile_version" INTEGER NOT NULL,
  "date" VARCHAR(10) NOT NULL,
  "variable" VARCHAR(40) NOT NULL,
  "unit" VARCHAR(12) NOT NULL,
  "value" DOUBLE PRECISION,
  "quality" VARCHAR(16) NOT NULL CHECK ("quality" IN ('modeled', 'missing')),
  "batch_id" UUID NOT NULL REFERENCES "weather_batches"("id") ON DELETE RESTRICT,
  CHECK (("quality" = 'missing' AND "value" IS NULL) OR ("quality" = 'modeled' AND "value" IS NOT NULL))
);
CREATE UNIQUE INDEX "weather_observations_plot_id_profile_version_date_variable_key"
  ON "weather_observations"("plot_id", "profile_version", "date", "variable");
