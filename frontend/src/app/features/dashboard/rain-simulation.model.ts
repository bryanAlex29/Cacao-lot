/** Escenas ficticias de presentación, no telemetría, pronóstico ni modelo físico. */
export interface RainSimulationStage {
  readonly label: string;
  readonly temperatureC: number;
  readonly airHumidityPct: number;
  readonly soilAPct: number;
}

export const rainSimulationStages = [
  { label: 'Inicio de lluvia · DEMO', temperatureC: 26, airHumidityPct: 82, soilAPct: 35 },
  { label: 'Escenario posterior · DEMO', temperatureC: 25, airHumidityPct: 88, soilAPct: 48 },
  { label: 'Escenario final · DEMO', temperatureC: 24, airHumidityPct: 92, soilAPct: 61 },
] as const satisfies readonly RainSimulationStage[];
