/** Contratos compartidos de autenticación y telemetría; no validan entradas HTTP. */
export type DataSource = 'real' | 'demo';
export type UserRole = 'ADMIN' | 'FARMER';

export interface AccountUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AccountUser;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface PlotSummary {
  id: string;
  ownerId: string;
  name: string;
  locationLabel: string;
  areaM2: number | null;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export type SoilSensorId = 'soil_1' | 'soil_2' | 'soil_3';
export type SoilMoistureMap = Record<SoilSensorId, number | null>;
export type SensorHealth = 'valid' | 'missing' | 'invalid' | 'uncalibrated';
export type ConnectionStatus = 'online' | 'stale' | 'offline' | 'unknown';
export type QualityKey =
  | SoilSensorId
  | 'temperatureC'
  | 'airHumidityPct'
  | 'rainDetected'
  | 'relayCommandedOpen'
  | 'feedbackOpen';

export interface ValveState {
  relayCommandedOpen: boolean | null;
  feedbackOpen: boolean | null;
}

export interface TelemetryReading {
  eventId: string;
  deviceId: string;
  recordedAt: string | null;
  receivedAt: string;
  timestampOrigin: 'device' | 'server';
  source: DataSource;
  soilMoisture: SoilMoistureMap;
  temperatureC: number | null;
  airHumidityPct: number | null;
  rainDetected: boolean | null;
  valve: ValveState;
  quality: Record<QualityKey, SensorHealth>;
}

export interface TelemetryUpdatedEvent {
  schemaVersion: '1.0';
  plotId: string;
  reading: TelemetryReading;
}

export interface IotTelemetryPayload {
  schemaVersion: '1.2';
  eventId: string;
  deviceId: string;
  recordedAt: string | null;
  soilMoisture: SoilMoistureMap;
  temperatureC: number | null;
  airHumidityPct: number | null;
  rainDetected: boolean | null;
  valve: ValveState;
  /** Informativo: el canal autenticado determina el origen en servidor. */
  source?: DataSource;
}

/** Snapshot inicial de telemetría; rangos, alertas y métricas se añaden en su fase. */
export interface TelemetrySnapshot {
  plotId: string;
  source: DataSource;
  device: {
    id: string;
    status: ConnectionStatus;
    lastSeenAt: string | null;
    expectedIntervalSeconds: number;
  } | null;
  reading: TelemetryReading | null;
}

export interface TelemetrySubscription {
  plotId: string;
  deviceId: string;
  source: DataSource;
}
export interface DeviceStatusEvent extends TelemetrySubscription {
  status: ConnectionStatus;
  lastSeenAt: string | null;
  expectedIntervalSeconds: number;
}

export interface TelemetryIngestionResult {
  duplicate: boolean;
  reading: TelemetryReading;
}
