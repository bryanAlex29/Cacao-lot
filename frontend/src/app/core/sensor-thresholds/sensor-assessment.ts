import type { DataSource, SensorHealth } from '@cacaosmart/contracts';
import {
  quantitativeSensors,
  QuantitativeSensorCode,
  SensorRangeState,
} from './sensor-thresholds.types';

export type SensorComparison =
  | 'low'
  | 'within'
  | 'high'
  | 'missing'
  | 'invalid'
  | 'stale'
  | 'unselected'
  | 'loading'
  | 'unconfigured'
  | 'unavailable';
export interface SensorAssessment {
  value: number | null;
  qualityLabel: string;
  comparison: SensorComparison;
  label: string;
  icon: string;
  tone: 'neutral' | 'warning' | 'danger' | 'within' | 'demo';
  note: string;
  barColor: string;
}

const labels: Record<SensorComparison, string> = {
  low: 'Bajo',
  within: 'En rango',
  high: 'Alto',
  missing: 'Sin datos',
  invalid: 'Dato inválido',
  stale: 'Desactualizado',
  unselected: 'Sin dispositivo seleccionado',
  loading: 'Consultando rango…',
  unconfigured: 'Sin rango configurado',
  unavailable: 'Rango no disponible',
};
const icons: Partial<Record<SensorComparison, string>> = {
  low: '↓',
  within: '↔',
  high: '↑',
  stale: '◷',
  invalid: '!',
};
const colors: Record<SensorAssessment['tone'], string> = {
  neutral: '#526158',
  warning: '#a45000',
  danger: '#a32222',
  within: '#087d16',
  demo: '#1263bd',
};

/** Point-in-time numeric comparison only; never calibration, crop diagnosis or an irrigation rule. */
export function assessSensor(input: {
  code: QuantitativeSensorCode;
  value: number | null;
  quality: SensorHealth;
  stale: boolean;
  source: DataSource;
  range: SensorRangeState;
}): SensorAssessment {
  const { code, value, quality, stale, source, range: state } = input;
  const expected = quantitativeSensors[code];
  const lower = expected.unit === 'PERCENT' ? 0 : -50;
  const invalid =
    quality === 'invalid' ||
    (quality !== 'missing' && quality !== 'valid' && quality !== 'uncalibrated') ||
    (value !== null && (!Number.isFinite(value) || value < lower || value > 100));
  const missing = value === null || quality === 'missing';
  const displayed = invalid || missing ? null : value;
  const qualityLabel = invalid
    ? 'Dato inválido'
    : missing
      ? 'Sin datos'
      : quality === 'uncalibrated'
        ? 'Sin calibrar'
        : 'Dato recibido';
  const result = (
    comparison: SensorComparison,
    tone: SensorAssessment['tone'] = 'neutral',
    note = '',
  ): SensorAssessment => ({
    value: displayed,
    qualityLabel,
    comparison,
    label: labels[comparison],
    icon: icons[comparison] ?? '—',
    tone,
    note,
    barColor: colors[tone],
  });
  if (invalid) return result('invalid', 'danger');
  if (missing) return result('missing');
  if (stale) return result('stale', 'warning');
  if (state.status === 'unselected') return result('unselected');
  if (state.status === 'loading') return result('loading');
  if (state.status === 'unconfigured') return result('unconfigured');
  const range = state.range;
  if (
    state.status !== 'configured' ||
    !range ||
    state.unit !== expected.unit ||
    !Number.isFinite(range.minValue) ||
    !Number.isFinite(range.maxValue) ||
    range.minValue < lower ||
    range.maxValue > 100 ||
    range.minValue >= range.maxValue
  )
    return result('unavailable');
  // Inclusive endpoints are an explicit monitoring convention, not a firmware policy.
  const comparison = value! < range.minValue ? 'low' : value! > range.maxValue ? 'high' : 'within';
  const tone =
    comparison === 'low'
      ? 'warning'
      : comparison === 'high'
        ? 'danger'
        : source === 'demo'
          ? 'demo'
          : quality === 'uncalibrated'
            ? 'warning'
            : 'within';
  const note =
    source === 'demo'
      ? 'DEMO · Comparación simulada'
      : quality === 'uncalibrated'
        ? 'Comparación numérica · sin calibrar'
        : 'Comparación numérica, no diagnóstico';
  return result(comparison, tone, note);
}
