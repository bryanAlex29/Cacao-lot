import type { IotTelemetryPayload } from '@cacaosmart/contracts';

/** Conversión del origen externo, previa a autenticación/validación/persistencia. */
export interface ExternalTelemetryAdapter {
  normalize(payload: unknown): Promise<IotTelemetryPayload>;
}
