import { MockVisionAnalysisProvider, validateVisionResult } from './vision-analysis.provider';

describe('Proveedor de visión simulado y esquema de salida', () => {
  it('no inventa enfermedad, certeza, síntomas reales ni porcentajes', async () => {
    const result = validateVisionResult(
      await new MockVisionAnalysisProvider().analyze(Buffer.from('image')),
    );
    expect(result.plantPart).toBe('unknown');
    expect(result.possibleCauses).toEqual([]);
    expect(result.uncertainty).toBe('high');
    expect(result.requiresExpertReview).toBe(true);
    expect(result.disclaimer).toContain('simulado');
  });
  it.each([null, 'texto', {}, { requiresExpertReview: false }, { visibleSymptoms: 'no-array' }])(
    'rechaza salida malformada %j',
    (value) => {
      expect(() => validateVisionResult(value)).toThrow();
    },
  );
  it('descarta campos ajenos, como comandos, sin ejecutarlos', async () => {
    const result = await new MockVisionAnalysisProvider().analyze(Buffer.alloc(0));
    expect(validateVisionResult({ ...result, command: 'open-valve' })).not.toHaveProperty(
      'command',
    );
    expect(() => validateVisionResult({ ...result, recommendedActions: [123] })).toThrow();
    expect(() => validateVisionResult({ ...result, uncertainty: 'certain' })).toThrow();
  });
});
