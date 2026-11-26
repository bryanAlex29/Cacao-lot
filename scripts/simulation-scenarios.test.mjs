import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulationScenarios } from './simulation-scenarios.mjs';
import { inspectTelemetryPayload } from './iot-contract-core.mjs';

const now = '2026-11-25T12:00:00.000Z';
const id = '00000000-0000-4000-8000-000000000001';
test('escenarios deterministas independientes, DEMO y sin feedback físico inventado', () => {
  const cases = simulationScenarios(id, now);
  assert.deepEqual(cases, simulationScenarios(id, now));
  assert.equal(cases.source, 'demo');
  assert.equal(cases.hypotheticalRange.agronomicallyValidated, false);
  for (const step of cases.steps) {
    assert.equal(step.payload.deviceId, id);
    assert.equal(step.payload.valve.feedbackOpen, null);
    if (step.name !== 'source-spoof') assert.equal(step.payload.source, 'demo');
  }
  cases.steps[0].payload.soilMoisture.soil_1 = 999;
  assert.equal(cases.steps[1].payload.soilMoisture.soil_1, 15);
  assert.throws(() => simulationScenarios(id, 'bad'));
});
test('duplicado exacto y conflicto deliberado conservan identidad temporal', () => {
  const cases = simulationScenarios(id, now);
  const find = (name) => cases.steps.find((step) => step.name === name).payload;
  assert.deepEqual(find('rain-observation'), find('duplicate'));
  assert.equal(find('duplicate').eventId, find('conflicting-id').eventId);
  assert.equal(find('duplicate').recordedAt, find('conflicting-id').recordedAt);
  assert.notDeepEqual(find('duplicate'), find('conflicting-id'));
  assert.ok(Date.parse(find('late-message').recordedAt) < Date.parse(find('normal').recordedAt));
});
test('mismo contrato HTTP rechaza solo datos inválidos y futuro; no rellena null/cero', async () => {
  const cases = simulationScenarios(id, now);
  for (const step of cases.steps) {
    const inspected = await inspectTelemetryPayload(step.payload, Date.parse(now));
    assert.equal(inspected.ok, step.expectedStatus !== 400, step.name);
  }
  const missing = cases.steps.find((step) => step.name === 'missing-soil-2').payload;
  assert.equal(missing.soilMoisture.soil_1, 0);
  assert.equal(missing.soilMoisture.soil_2, null);
});
