import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineExportComponent } from './offline-export.component';
import { OfflineExportApi } from './offline-export-api.service';
import { OfflineJsonDownload } from './offline-json-download.service';

const selection = { plotId: 'plot', deviceId: 'device', source: 'demo' as const };
const dates = {
  from: '2026-01-03',
  trainUntil: '2026-01-05',
  validationUntil: '2026-01-07',
  toExclusive: '2026-01-09',
};
describe('Panel de descarga offline', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup(selected = true) {
    const response = new Subject<{ blob: Blob; count: number }>();
    const download = vi.fn(() => response.asObservable()),
      save = vi.fn();
    await TestBed.configureTestingModule({
      imports: [OfflineExportComponent],
      providers: [
        { provide: OfflineExportApi, useValue: { download } },
        { provide: OfflineJsonDownload, useValue: { save } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OfflineExportComponent);
    fixture.componentRef.setInput('selection', selected ? selection : null);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    return { fixture, component, response, download, save };
  }
  it('sin selección no consulta ni presenta un formulario activo', async () => {
    const { fixture, component, download } = await setup(false);
    component.download();
    expect(download).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
  it('etiqueta DEMO/UTC, conserva accesibilidad y no calcula ni entrena modelos', async () => {
    const { fixture, component, download } = await setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('label')).toHaveLength(4);
    expect(root.textContent).toContain('DEMO · Datos simulados');
    expect(root.textContent).toContain('Fechas en UTC, no hora local');
    expect(root.textContent).toContain('No entrena modelos');
    expect(root.textContent).toContain('100000 filas');
    component.form.setValue({ ...dates, trainUntil: dates.from });
    component.download();
    expect(component.error()).toContain('Desde <');
    expect(download).not.toHaveBeenCalled();
  });
  it('descarga solo la selección y cortes capturados, evita doble clic y conserva fechas', async () => {
    const { fixture, component, response, download, save } = await setup();
    component.form.setValue(dates);
    component.download();
    component.download();
    fixture.detectChanges();
    expect(download).toHaveBeenCalledExactlyOnceWith(selection, dates);
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    const blob = new Blob(['{}'], { type: 'application/json' });
    response.next({ blob, count: 3 });
    expect(save).toHaveBeenCalledExactlyOnceWith(
      blob,
      'cacaosmart-offline-demo-device-2026-01-03-2026-01-09.json',
    );
    expect(component.busy()).toBe(false);
    expect(component.message()).toContain('3 observaciones');
    expect(component.form.getRawValue()).toEqual(dates);
  });
  it('archivo vacío se advierte sin inventar suficiencia', async () => {
    const { component, response, save } = await setup();
    component.form.setValue(dates);
    component.download();
    response.next({ blob: new Blob(), count: 0 });
    expect(save).toHaveBeenCalledTimes(1);
    expect(component.message()).toContain('0 observaciones');
    expect(component.message()).toContain('no permite evaluar');
  });
  it.each([
    [413, 'No se descargó un archivo parcial'],
    [401, 'Vuelve a iniciar sesión'],
    [403, 'Comprueba los permisos'],
    [404, 'Comprueba los permisos'],
    [400, 'fechas o cortes'],
    [0, 'no se reintentó automáticamente'],
  ])('error %i conserva borrador y permite reintento explícito', async (status, text) => {
    const { component, response, download, save } = await setup();
    component.form.setValue(dates);
    component.download();
    response.error(new HttpErrorResponse({ status }));
    expect(component.error()).toContain(text);
    expect(component.form.getRawValue()).toEqual(dates);
    expect(component.busy()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(1);
    component.download();
    expect(download).toHaveBeenCalledTimes(2);
  });
  it.each([
    null,
    { ...selection, deviceId: 'other' },
    { ...selection, plotId: 'other' },
    { ...selection, source: 'real' },
  ])('cambiar selección cancela y limpia borradores/mensajes %j', async (next) => {
    const { fixture, component, response, save } = await setup();
    component.form.setValue(dates);
    component.download();
    fixture.componentRef.setInput('selection', next);
    fixture.detectChanges();
    expect(response.observed).toBe(false);
    response.next({ blob: new Blob(), count: 5 });
    expect(save).not.toHaveBeenCalled();
    expect(component.form.getRawValue().from).toBe('');
    expect(component.busy()).toBe(false);
    expect(component.message()).toBe('');
  });
  it('no guarda respuesta de la selección anterior ni antes del próximo render', async () => {
    const { fixture, component, response, save } = await setup();
    component.form.setValue(dates);
    component.download();
    fixture.componentRef.setInput('selection', { ...selection, deviceId: 'other' });
    response.next({ blob: new Blob(), count: 5 });
    expect(save).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(component.busy()).toBe(false);
  });
  it('destruir la vista cancela la descarga pendiente', async () => {
    const { fixture, component, response } = await setup();
    component.form.setValue(dates);
    component.download();
    fixture.destroy();
    expect(response.observed).toBe(false);
  });
  it('fallo del navegador no afirma descarga guardada', async () => {
    const { component, response, save } = await setup();
    save.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    component.form.setValue(dates);
    component.download();
    response.next({ blob: new Blob(), count: 1 });
    expect(component.error()).toContain('no pudo iniciar');
    expect(component.message()).toBe('');
    expect(component.busy()).toBe(false);
  });
});
