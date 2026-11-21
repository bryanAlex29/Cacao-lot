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

export type ThresholdVariable = 'SOIL_MOISTURE' | 'TEMPERATURE' | 'AIR_HUMIDITY';
export type ThresholdUnit = 'PERCENT' | 'CELSIUS';

export interface PutSensorThresholdInput {
  variable: ThresholdVariable;
  unit: ThresholdUnit;
  minValue: number;
  maxValue: number;
  /** 0 creates a range; otherwise must match the current version. */
  expectedVersion: number;
}

export interface SensorThresholdRange {
  id: string;
  minValue: number;
  maxValue: number;
  /** Reserved; always 0 until alert hysteresis is implemented. */
  hysteresis: number;
  effectiveAt: string;
  updatedBy: string;
  version: number;
}

export interface SensorThresholdResponse {
  sensorId: string;
  deviceId: string;
  plotId: string;
  source: DataSource;
  variable: ThresholdVariable;
  unit: ThresholdUnit;
  threshold: SensorThresholdRange | null;
}

/** Historical monitoring only; intervals are [from, to), never firmware policy. */
export interface SensorThresholdInterval {
  from: string;
  to: string;
  threshold: Pick<SensorThresholdRange, 'minValue' | 'maxValue' | 'effectiveAt' | 'version'> | null;
}

export interface SensorThresholdHistoryResponse extends Omit<SensorThresholdResponse, 'threshold'> {
  from: string;
  to: string;
  intervals: SensorThresholdInterval[];
}

export type OfflineAlertCloseReason =
  'CONTACT_RESTORED' | 'MONITORING_STOPPED' | 'INTERVAL_CHANGED';

/** Device connectivity only, not sensor quality, crop health or valve control. */
export interface DeviceOfflineAlert extends TelemetrySubscription {
  id: string;
  type: 'DEVICE_OFFLINE';
  severity: 'warning';
  lastSeenAt: string;
  expectedIntervalSeconds: number;
  detectedAt: string;
  closedAt: string | null;
  closeReason: OfflineAlertCloseReason | null;
  acknowledgedAt: string | null;
}

export interface MoisturePolicy {
  recoveryMarginPct: number;
  version: number;
  updatedAt: string;
}
export interface MoisturePolicyResponse extends TelemetrySubscription {
  sensorId: string;
  code: SoilSensorId;
  range: Pick<SensorThresholdRange, 'minValue' | 'maxValue' | 'version' | 'effectiveAt'> | null;
  policy: MoisturePolicy | null;
  status:
    | 'unconfigured'
    | 'no_range'
    | 'incompatible_margin'
    | 'disabled'
    | 'real_uncalibrated'
    | 'ready';
}
export interface PutMoisturePolicyInput {
  recoveryMarginPct: number;
  expectedVersion: number;
  expectedThresholdVersion: number;
}
export type MoistureAlertCloseReason = 'RECOVERED' | 'CONFIGURATION_CHANGED' | 'MONITORING_STOPPED';
export interface SoilMoistureAlert extends TelemetrySubscription {
  id: string;
  sensorId: string;
  code: SoilSensorId;
  type: 'LOW_SOIL_MOISTURE';
  minValue: number;
  maxValue: number;
  recoveryMarginPct: number;
  thresholdVersion: number;
  policyVersion: number;
  firstLowAt: string;
  confirmedAt: string;
  triggerValue: number;
  detectedAt: string;
  closedAt: string | null;
  closeReason: MoistureAlertCloseReason | null;
  acknowledgedAt: string | null;
}
