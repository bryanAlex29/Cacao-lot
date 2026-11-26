import { BadRequestException } from '@nestjs/common';

/** Used after DTO validation, both by HTTP ingestion and the offline contract check. */
export function requireTelemetryTimestamp(recordedAt: string | null, now = Date.now()): void {
  if (
    recordedAt !== null &&
    (!/(Z|[+-]\d{2}:\d{2})$/.test(recordedAt) || new Date(recordedAt).getTime() > now + 60000)
  )
    throw new BadRequestException(
      'recordedAt requiere zona horaria y no puede superar 60 segundos en el futuro',
    );
}
