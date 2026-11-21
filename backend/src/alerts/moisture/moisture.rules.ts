import type { SensorHealth } from '@cacaosmart/contracts';

export interface MoistureSequence {
  lowCount: number;
  recoveryCount: number;
  firstLowAt: Date | null;
  lastEffectiveAt: Date | null;
}
export const resetSequence = () => ({ lowCount: 0, recoveryCount: 0, firstLowAt: null });

/** Equal timestamps and older messages never add confirmations. Quality/age never imply recovery. */
export function advanceMoisture(
  previous: MoistureSequence,
  sample: { time: Date; value: number | null; quality: SensorHealth },
  context: {
    now: Date;
    epoch: Date;
    maxGapMs: number;
    source: 'real' | 'demo';
    min: number;
    margin: number;
    active: boolean;
  },
): MoistureSequence & { action: 'none' | 'open' | 'recover' } {
  const state = { ...previous, action: 'none' as 'none' | 'open' | 'recover' };
  if (state.lastEffectiveAt && sample.time <= state.lastEffectiveAt) return state;
  if (sample.time > context.now) return { ...state, ...resetSequence() };
  const gap = state.lastEffectiveAt
    ? sample.time.getTime() - state.lastEffectiveAt.getTime()
    : Infinity;
  state.lastEffectiveAt = sample.time;
  if (gap > context.maxGapMs) Object.assign(state, resetSequence());
  const age = context.now.getTime() - sample.time.getTime();
  if (
    sample.time <= context.epoch ||
    age < 0 ||
    age > context.maxGapMs ||
    sample.value === null ||
    !Number.isFinite(sample.value) ||
    sample.value < 0 ||
    sample.value > 100 ||
    (sample.quality !== 'valid' &&
      !(context.source === 'demo' && sample.quality === 'uncalibrated'))
  ) {
    return { ...state, ...resetSequence() };
  }
  if (!context.active) {
    state.recoveryCount = 0;
    if (sample.value < context.min) {
      state.firstLowAt ??= sample.time;
      state.lowCount++;
      if (state.lowCount === 3) state.action = 'open';
    } else Object.assign(state, resetSequence());
  } else {
    state.lowCount = 0;
    state.firstLowAt = null;
    state.recoveryCount =
      sample.value >= context.min + context.margin ? state.recoveryCount + 1 : 0;
    if (state.recoveryCount === 3) state.action = 'recover';
  }
  return state;
}
