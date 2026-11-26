-- Preserve existing mock records; permit explicitly consented external analyses.
ALTER TABLE "ai_diagnoses" DROP CONSTRAINT "ai_diagnoses_provider_check";
ALTER TABLE "ai_diagnoses" ADD CONSTRAINT "ai_diagnoses_provider_check"
  CHECK ("provider" IN ('mock', 'openai'));
ALTER TABLE "ai_diagnoses" ADD CONSTRAINT "ai_diagnoses_provider_consent_check"
  CHECK (("provider" = 'mock' AND "consent_version" = 'demo-v1')
      OR ("provider" = 'openai' AND "consent_version" = 'openai-v1'));
