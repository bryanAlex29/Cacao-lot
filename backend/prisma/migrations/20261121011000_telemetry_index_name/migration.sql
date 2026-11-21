-- PostgreSQL limita identificadores a 63 bytes; usar nombre explícito estable en Prisma.
ALTER INDEX "readings_device_id_source_effective_at_received_at_ingestion_id"
RENAME TO "readings_device_source_time_idx";
