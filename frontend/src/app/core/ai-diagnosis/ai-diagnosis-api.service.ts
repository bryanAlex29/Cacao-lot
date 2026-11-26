import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type { Page } from '@cacaosmart/contracts';

export interface DiagnosisResult {
  plantPart: 'unknown' | 'leaf' | 'fruit' | 'stem';
  visibleSymptoms: string[];
  possibleCauses: { name: string; reason: string }[];
  uncertainty: 'high' | 'medium';
  recommendedActions: string[];
  requiresExpertReview: true;
  disclaimer: string;
}
export interface Diagnosis {
  id: string;
  plotId: string;
  requestId: string;
  status: 'pending' | 'completed' | 'failed';
  source: 'demo' | 'real';
  provider: 'mock' | 'openai';
  notes: string | null;
  result: DiagnosisResult | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  hasImage: boolean;
}
export interface DiagnosisOptions {
  provider: 'mock' | 'disabled' | 'openai';
  maxImageBytes: number;
  dailyLimit: number;
  retentionDays: number;
  consentVersion: 'demo-v1' | 'openai-v1';
}
export interface DiagnosisHistoryFilters {
  status?: Diagnosis['status'];
  from?: string;
  to?: string;
}
function checked(value: Diagnosis, plotId: string): Diagnosis {
  if (
    !value ||
    value.plotId !== plotId ||
    !(
      (value.provider === 'mock' && value.source === 'demo') ||
      (value.provider === 'openai' && value.source === 'real')
    ) ||
    !['pending', 'completed', 'failed'].includes(value.status) ||
    typeof value.id !== 'string' ||
    typeof value.requestId !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    typeof value.hasImage !== 'boolean' ||
    (value.status === 'completed' &&
      (!value.result ||
        value.result.requiresExpertReview !== true ||
        !Array.isArray(value.result.visibleSymptoms) ||
        !Array.isArray(value.result.possibleCauses) ||
        !Array.isArray(value.result.recommendedActions) ||
        typeof value.result.disclaimer !== 'string'))
  ) {
    throw new Error('Respuesta de diagnóstico incompatible');
  }
  return value;
}
@Injectable({ providedIn: 'root' })
export class AiDiagnosisApi {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/v1/ai-diagnostics';
  options() {
    return this.http.get<DiagnosisOptions>(`${this.url}/config`).pipe(timeout(8000));
  }
  create(
    plotId: string,
    file: File,
    notes: string,
    requestId: string,
    retentionDays: number,
    consentVersion: DiagnosisOptions['consentVersion'] = 'demo-v1',
  ) {
    const body = new FormData();
    body.append('plotId', plotId);
    body.append('requestId', requestId);
    body.append('consentVersion', consentVersion);
    body.append('retentionDays', String(retentionDays));
    if (notes.trim()) body.append('notes', notes.trim());
    body.append('image', file, 'cacao-upload');
    return this.http.post<Diagnosis>(this.url, body).pipe(
      timeout(45000),
      map((value) => {
        const record = checked(value, plotId);
        if (record.provider !== (consentVersion === 'openai-v1' ? 'openai' : 'mock'))
          throw new Error('Proveedor distinto del autorizado');
        return record;
      }),
    );
  }
  list(plotId: string, offset: number, filters: DiagnosisHistoryFilters = {}) {
    const params: Record<string, string | number> = { plotId, limit: 10, offset };
    if (filters.status) params['status'] = filters.status;
    if (filters.from) params['from'] = filters.from;
    if (filters.to) params['to'] = filters.to;
    return this.http.get<Page<Diagnosis>>(this.url, { params }).pipe(
      timeout(8000),
      map((page) => {
        if (
          !page ||
          !Array.isArray(page.items) ||
          page.limit !== 10 ||
          page.offset !== offset ||
          !Number.isInteger(page.total) ||
          page.total < 0 ||
          page.items.length > 10 ||
          page.items.length > page.total ||
          page.items.some(
            (item) =>
              (filters.status && item.status !== filters.status) ||
              (filters.from && Date.parse(item.createdAt) < Date.parse(filters.from)) ||
              (filters.to && Date.parse(item.createdAt) > Date.parse(filters.to)),
          )
        ) {
          throw new Error('Historial incompatible');
        }
        return { ...page, items: page.items.map((value) => checked(value, plotId)) };
      }),
    );
  }
  get(id: string, plotId: string) {
    return this.http.get<Diagnosis>(`${this.url}/${encodeURIComponent(id)}`).pipe(
      timeout(8000),
      map((value) => {
        const record = checked(value, plotId);
        if (record.id !== id) throw new Error('Identidad de diagnóstico incompatible');
        return record;
      }),
    );
  }
  image(id: string) {
    return this.http
      .get(`${this.url}/${encodeURIComponent(id)}/image`, { responseType: 'blob' })
      .pipe(timeout(8000));
  }
  remove(id: string) {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`).pipe(timeout(8000));
  }
}
