import { Injectable } from '@nestjs/common';

export interface VisionResult {
  plantPart: 'unknown' | 'leaf' | 'fruit' | 'stem';
  visibleSymptoms: string[];
  possibleCauses: { name: string; reason: string }[];
  uncertainty: 'high' | 'medium';
  recommendedActions: string[];
  requiresExpertReview: true;
  disclaimer: string;
}
export abstract class VisionAnalysisProvider {
  abstract analyze(image: Buffer, notes?: string, signal?: AbortSignal): Promise<unknown>;
}
@Injectable()
export class MockVisionAnalysisProvider extends VisionAnalysisProvider {
  async analyze(_image: Buffer): Promise<VisionResult> {
    return {
      plantPart: 'unknown',
      visibleSymptoms: ['Demostración: no se han evaluado síntomas reales de esta fotografía.'],
      possibleCauses: [],
      uncertainty: 'high',
      recommendedActions: [
        'Tomar fotos nítidas de la planta completa y del área afectada.',
        'Solicitar revisión de un técnico agrícola si observas daños.',
      ],
      requiresExpertReview: true,
      disclaimer:
        'Resultado simulado, no concluyente. No es un diagnóstico agronómico ni confirma enfermedades.',
    };
  }
}
export function validateVisionResult(value: unknown): VisionResult {
  const text = (v: unknown): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= 1000;
  const list = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 10 && v.every(text);
  if (!value || typeof value !== 'object') throw new Error('Salida incompatible');
  const v = value as Record<string, unknown>;
  if (
    !['unknown', 'leaf', 'fruit', 'stem'].includes(String(v['plantPart'])) ||
    !list(v['visibleSymptoms']) ||
    !list(v['recommendedActions']) ||
    !Array.isArray(v['possibleCauses']) ||
    v['possibleCauses'].length > 10 ||
    !v['possibleCauses'].every(
      (c: unknown) =>
        !!c &&
        typeof c === 'object' &&
        text((c as Record<string, unknown>)['name']) &&
        text((c as Record<string, unknown>)['reason']),
    ) ||
    !['high', 'medium'].includes(String(v['uncertainty'])) ||
    v['requiresExpertReview'] !== true ||
    !text(v['disclaimer'])
  )
    throw new Error('Salida incompatible');
  return {
    plantPart: v['plantPart'] as VisionResult['plantPart'],
    visibleSymptoms: [...v['visibleSymptoms']],
    possibleCauses: v['possibleCauses'].map((c: { name: string; reason: string }) => ({
      name: c.name,
      reason: c.reason,
    })),
    uncertainty: v['uncertainty'] as VisionResult['uncertainty'],
    recommendedActions: [...v['recommendedActions']],
    requiresExpertReview: true,
    disclaimer: v['disclaimer'],
  };
}
