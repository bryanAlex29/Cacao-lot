import type { Page, PlotSummary } from '@cacaosmart/contracts';

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** Validate untrusted responses before acknowledging a write or unlocking a retry. */
export function checkedPlot(value: unknown, expectedId?: string): PlotSummary {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    !text(value.id) ||
    (expectedId !== undefined && value.id !== expectedId) ||
    !('name' in value) ||
    !text(value.name) ||
    !('locationLabel' in value) ||
    !text(value.locationLabel) ||
    !('areaM2' in value) ||
    (value.areaM2 !== null &&
      (typeof value.areaM2 !== 'number' ||
        !Number.isFinite(value.areaM2) ||
        value.areaM2 < 0.000001))
  )
    throw new Error('Respuesta de parcela incompatible');
  // ownerId/createdAt belong to the list/create model, but are not used to grant permissions.
  return value as PlotSummary;
}

export function checkedPlotPage(page: Page<PlotSummary>, offset: number): Page<PlotSummary> {
  if (
    !page ||
    !Array.isArray(page.items) ||
    !Number.isInteger(page.total) ||
    page.total < 0 ||
    page.limit !== 20 ||
    page.offset !== offset ||
    page.items.length > 20 ||
    page.items.length > page.total
  )
    throw new Error('Página de parcelas incompatible');
  const items = page.items.map((item) => checkedPlot(item));
  if (new Set(items.map((item) => item.id)).size !== items.length)
    throw new Error('Parcelas duplicadas en respuesta');
  return { items, total: page.total, limit: page.limit, offset: page.offset };
}
