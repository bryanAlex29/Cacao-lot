import { describe, expect, it } from 'vitest';
import { assessSensor } from './sensor-assessment';
import {
  quantitativeSensors,
  QuantitativeSensorCode,
  rangeStates,
  SensorRangeState,
} from './sensor-thresholds.types';
import type { SensorHealth } from '@cacaosmart/contracts';

const configured: SensorRangeState = {
  status: 'configured',
  unit: 'PERCENT',
  checkedAt: '2026-11-21T00:00:00Z',
  range: {
    id: 'range',
    minValue: 20,
    maxValue: 70,
    version: 1,
    updatedBy: 'admin',
    effectiveAt: '2026-11-21T00:00:00Z',
    hysteresis: 0,
  },
};
const base = {
  code: 'soil_1',
  source: 'real',
  value: 45,
  quality: 'valid',
  stale: false,
  range: configured,
} as const;

describe('Comparación numérica por sensor, independiente de calidad y firmware', () => {
  for (const code of Object.keys(quantitativeSensors) as QuantitativeSensorCode[]) {
    it.each([
      { value: 19.99, expected: 'low' },
      { value: 20, expected: 'within' },
      { value: 45, expected: 'within' },
      { value: 70, expected: 'within' },
      { value: 70.01, expected: 'high' },
    ])(`${code}: compara límites inclusivos %j`, ({ value, expected }) => {
      const assessment = assessSensor({
        ...base,
        code,
        value,
        range: { ...configured, unit: quantitativeSensors[code].unit },
      });
      expect(assessment.comparison).toBe(expected);
      expect(assessment.value).toBe(value);
      expect(assessment.qualityLabel).toBe('Dato recibido');
      expect(assessment.note).toContain('no diagnóstico');
      expect(assessment.label).not.toBe('Normal');
    });
  }

  it('cero es una lectura; no equivale a ausencia', () => {
    const assessment = assessSensor({
      ...base,
      value: 0,
      range: { ...configured, range: { ...configured.range!, minValue: 0 } },
    });
    expect(assessment.value).toBe(0);
    expect(assessment.comparison).toBe('within');
  });

  it('temperatura negativa conserva su unidad y clasificación propias', () => {
    const assessment = assessSensor({
      ...base,
      code: 'temperatureC',
      value: -10,
      range: {
        ...configured,
        unit: 'CELSIUS',
        range: { ...configured.range!, minValue: -10, maxValue: 20 },
      },
    });
    expect(assessment.value).toBe(-10);
    expect(assessment.comparison).toBe('within');
  });

  it.each([
    { value: null, quality: 'missing' as const },
    { value: null, quality: 'valid' as const },
    { value: 45, quality: 'missing' as const },
  ])('ausencia explícita no conserva ni clasifica valores %j', (override) => {
    const assessment = assessSensor({ ...base, ...override });
    expect(assessment.comparison).toBe('missing');
    expect(assessment.value).toBeNull();
    expect(assessment.qualityLabel).toBe('Sin datos');
    expect(assessment.tone).toBe('neutral');
  });

  it.each([
    { value: NaN },
    { value: Infinity },
    { value: -1 },
    { value: 101 },
    { quality: 'invalid' as const },
    { value: null, quality: 'invalid' as const },
    { quality: 'unknown' as SensorHealth },
  ])('dato inválido no se presenta como valor o comparación válidos %j', (override) => {
    const assessment = assessSensor({ ...base, ...override });
    expect(assessment.value).toBeNull();
    expect(assessment.comparison).toBe('invalid');
    expect(assessment.qualityLabel).toBe('Dato inválido');
    expect(assessment.tone).toBe('danger');
  });

  it.each([10, 45, 90])('una lectura antigua de %s no recibe clasificación vigente', (value) => {
    const assessment = assessSensor({ ...base, value, stale: true, quality: 'uncalibrated' });
    expect(assessment.comparison).toBe('stale');
    expect(assessment.qualityLabel).toBe('Sin calibrar');
    expect(assessment.label).toBe('Desactualizado');
    expect(assessment.tone).toBe('warning');
    expect(assessment.value).toBe(value);
  });

  it.each([
    { status: 'unselected' as const, expected: 'unselected' },
    { status: 'loading' as const, expected: 'loading' },
    { status: 'unconfigured' as const, expected: 'unconfigured' },
    { status: 'error' as const, expected: 'unavailable' },
    { status: 'disabled' as const, expected: 'unavailable' },
  ])('estado de configuración no equivale a lectura normal %j', ({ status, expected }) => {
    const assessment = assessSensor({ ...base, range: rangeStates(status).soil_1 });
    expect(assessment.comparison).toBe(expected);
    expect(assessment.tone).toBe('neutral');
    expect(assessment.value).toBe(45);
  });

  it.each([
    { unit: 'CELSIUS' as const },
    { range: null },
    { range: { ...configured.range!, minValue: 70 } },
    { range: { ...configured.range!, minValue: -1 } },
    { range: { ...configured.range!, maxValue: 101 } },
    { range: { ...configured.range!, minValue: NaN } },
  ])('rango incompatible o inválido no permite comparar %j', (override) => {
    expect(assessSensor({ ...base, range: { ...configured, ...override } }).comparison).toBe(
      'unavailable',
    );
  });

  it('un valor dentro del rango sin calibrar no obtiene indicador verde', () => {
    const assessment = assessSensor({ ...base, quality: 'uncalibrated' });
    expect(assessment.comparison).toBe('within');
    expect(assessment.qualityLabel).toBe('Sin calibrar');
    expect(assessment.tone).toBe('warning');
    expect(assessment.note).toContain('Comparación numérica · sin calibrar');
  });

  it('DEMO mantiene etiqueta y tono de demostración sin convertirse en medición real', () => {
    const assessment = assessSensor({ ...base, source: 'demo', quality: 'uncalibrated' });
    expect(assessment.comparison).toBe('within');
    expect(assessment.qualityLabel).toBe('Sin calibrar');
    expect(assessment.note).toContain('DEMO · Comparación simulada');
    expect(assessment.tone).toBe('demo');
  });

  it('actualizar el rango reclasifica el mismo número sin cambiar la lectura', () => {
    expect(assessSensor(base).comparison).toBe('within');
    const assessment = assessSensor({
      ...base,
      range: { ...configured, range: { ...configured.range!, maxValue: 40 } },
    });
    expect(assessment.comparison).toBe('high');
    expect(assessment.value).toBe(45);
    expect(configured.range?.maxValue).toBe(70);
  });
});
