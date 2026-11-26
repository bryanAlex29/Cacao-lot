import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import type { CurrentWeather, WeatherCity } from '@cacaosmart/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { CurrentWeatherCardComponent, weatherAppearance } from './current-weather-card.component';

function response(plotId = 'plot'): CurrentWeather {
  return {
    plotId,
    status: 'available',
    current: {
      observedAt: new Date().toISOString(),
      fetchedAt: new Date().toISOString(),
      temperatureC: 26,
      apparentTemperatureC: 28,
      humidityPct: 80,
      precipitationMm: 0,
      intervalSeconds: 900,
      weatherCode: 3,
      isDay: false,
      provider: 'Open-Meteo',
      quality: 'modeled',
    },
  };
}
describe('Current weather dashboard card', () => {
  const city: WeatherCity = {
    id: 3659139,
    name: 'Chone',
    region: 'Manabí',
    country: 'Ecuador',
    countryCode: 'EC',
  };
  afterEach(() => TestBed.resetTestingModule());
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [CurrentWeatherCardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CurrentWeatherCardComponent);
    fixture.componentRef.setInput('plotId', 'plot');
    fixture.componentRef.setInput('location', 'Parcela de prueba');
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      http: TestBed.inject(HttpTestingController),
      root: fixture.nativeElement as HTMLElement,
    };
  }
  it('shows location, modeled condition, units, timestamps and zero without touching telemetry', async () => {
    const { fixture, http, root } = await setup();
    expect(root.textContent).toContain('Consultando clima');
    http.expectOne('/api/v1/plots/plot/weather/current').flush(response());
    fixture.detectChanges();
    for (const text of [
      'Clima actual',
      'Parcela de prueba',
      '26 °C',
      '28 °C',
      '80 %',
      '0 mm',
      'Nublado',
      '15 min',
      'Open-Meteo',
      'No es una medición del ESP32',
      'Hora del clima',
    ])
      expect(root.textContent).toContain(text);
    expect(root.textContent).not.toContain('Simular lluvia');
    http.verify();
  });
  it('shows missing location and an actual configuration link, not invented weather', async () => {
    const { fixture, http, root } = await setup();
    http
      .expectOne('/api/v1/plots/plot/weather/current')
      .flush({ plotId: 'plot', status: 'location_required', current: null });
    fixture.detectChanges();
    expect(root.textContent).toContain('Elige una ciudad aquí');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/parcelas/plot/clima');
    expect(root.querySelector('.temperature')).toBeNull();
  });
  it('does not show missing precipitation as zero', async () => {
    const { fixture, http, root } = await setup();
    const value = response();
    value.current!.precipitationMm = null;
    http.expectOne('/api/v1/plots/plot/weather/current').flush(value);
    fixture.detectChanges();
    expect(root.textContent).toContain('Sin datos');
    expect(root.textContent).not.toContain('0 mm');
  });
  it('rejects another plot response and allows a read-only retry', async () => {
    const { fixture, http, root } = await setup();
    http.expectOne('/api/v1/plots/plot/weather/current').flush(response('other'));
    fixture.detectChanges();
    expect(root.textContent).toContain('Clima actual no disponible');
    root.querySelector<HTMLButtonElement>('.refresh-weather')!.click();
    fixture.detectChanges();
    http.expectOne('/api/v1/plots/plot/weather/current').flush(response());
    fixture.detectChanges();
    expect(root.textContent).toContain('Nublado');
    http.expectNone((r) => r.method !== 'GET');
  });
  it('clears old conditions when the plot changes and cancels pending requests', async () => {
    const { fixture, http, root } = await setup();
    const pending = http.expectOne('/api/v1/plots/plot/weather/current');
    fixture.componentRef.setInput('plotId', 'next');
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    http.expectOne('/api/v1/plots/next/weather/current').flush(response('next'));
    fixture.detectChanges();
    expect(root.textContent).toContain('Nublado');
    fixture.destroy();
    http.verify();
  });
  it('does not retain obsolete conditions after a failed refresh', async () => {
    const { fixture, http, root } = await setup();
    http.expectOne('/api/v1/plots/plot/weather/current').flush(response());
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.refresh-weather')!.click();
    fixture.detectChanges();
    http
      .expectOne('/api/v1/plots/plot/weather/current')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(root.textContent).toContain('no disponible');
    expect(root.querySelector('.temperature')).toBeNull();
  });
  it('searches and selects city inline without changing plot location or issuing writes', async () => {
    const { fixture, component, http, root } = await setup();
    http
      .expectOne('/api/v1/plots/plot/weather/current')
      .flush({ plotId: 'plot', status: 'location_required', current: null });
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('.choose-city')!.click();
    fixture.detectChanges();
    const input = root.querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'Chone';
    input.dispatchEvent(new Event('input'));
    root
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    http.expectOne('/api/v1/plots/plot/weather/cities?name=Chone').flush({
      plotId: 'plot',
      status: 'available',
      items: [city, { ...city, id: 42, region: 'Otra región' }],
    });
    fixture.detectChanges();
    expect(root.querySelectorAll('.city-results button')).toHaveLength(2);
    root.querySelector<HTMLButtonElement>('.city-results button')!.click();
    fixture.detectChanges();
    expect(root.querySelector('form')).toBeNull();
    expect(component.location()).toBe('Parcela de prueba');
    http
      .expectOne(`/api/v1/plots/plot/weather/current?cityId=${city.id}`)
      .flush({ ...response(), city });
    fixture.detectChanges();
    expect(root.querySelector('.location')?.textContent).toContain('Chone, Manabí, Ecuador');
    expect(root.textContent).toContain('Clima de referencia de la ciudad');
    expect(root.textContent).toContain('Nublado');
    http.expectNone((req) => req.method !== 'GET');
    http.verify();
  });
  it('cancels an obsolete search when text changes and resets city selection on plot changes', async () => {
    const { fixture, component, http } = await setup();
    http.expectOne('/api/v1/plots/plot/weather/current').flush(response());
    component.cityQuery.setValue('Chone');
    component.searchCities();
    const pending = http.expectOne('/api/v1/plots/plot/weather/cities?name=Chone');
    component.cityQuery.setValue('Quito');
    expect(pending.cancelled).toBe(true);
    component.searchCities();
    http
      .expectOne('/api/v1/plots/plot/weather/cities?name=Quito')
      .flush({ plotId: 'plot', status: 'available', items: [city] });
    component.chooseCity(city);
    fixture.detectChanges();
    const cityRequest = http.expectOne(`/api/v1/plots/plot/weather/current?cityId=${city.id}`);
    fixture.componentRef.setInput('plotId', 'next');
    fixture.detectChanges();
    expect(cityRequest.cancelled).toBe(true);
    expect(component.selectedCity()).toBeNull();
    http.expectOne('/api/v1/plots/next/weather/current').flush(response('next'));
    fixture.detectChanges();
    expect(component.displayedLocation()).toBe('Parcela de prueba');
    http.verify();
  });
  it('does not search for short names, then shows empty, disabled and failed searches honestly', async () => {
    const { fixture, component, http, root } = await setup();
    http.expectOne('/api/v1/plots/plot/weather/current').flush(response());
    component.cityQuery.setValue('a');
    component.searchCities();
    expect(component.citySearchMessage()).toContain('2 a 80');
    http.expectNone((req) => req.url.endsWith('/cities'));
    component.cityQuery.setValue('Chone');
    component.searchCities();
    http
      .expectOne('/api/v1/plots/plot/weather/cities?name=Chone')
      .flush({ plotId: 'plot', status: 'available', items: [] });
    expect(component.citySearchMessage()).toContain('No se encontraron');
    component.searchCities();
    http
      .expectOne('/api/v1/plots/plot/weather/cities?name=Chone')
      .flush({ plotId: 'plot', status: 'disabled', items: [] });
    expect(component.citySearchMessage()).toContain('desactivado');
    component.searchCities();
    http
      .expectOne('/api/v1/plots/plot/weather/cities?name=Chone')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.citySearchMessage()).toContain('No se pudieron');
    fixture.detectChanges();
    expect(root.textContent).toContain('26 °C');
  });
  it('rejects city results from another plot and weather for a different city', async () => {
    const { fixture, component, http } = await setup();
    http.expectOne('/api/v1/plots/plot/weather/current').flush(response());
    component.cityQuery.setValue('Chone');
    component.searchCities();
    http
      .expectOne('/api/v1/plots/plot/weather/cities?name=Chone')
      .flush({ plotId: 'other', status: 'available', items: [city] });
    expect(component.cityResults()).toEqual([]);
    component.searchCities();
    http
      .expectOne('/api/v1/plots/plot/weather/cities?name=Chone')
      .flush({ plotId: 'plot', status: 'available', items: [city] });
    component.chooseCity(city);
    fixture.detectChanges();
    http
      .expectOne(`/api/v1/plots/plot/weather/current?cityId=${city.id}`)
      .flush({ ...response(), city: { ...city, id: 42 } });
    expect(component.data()).toBeNull();
    expect(component.error()).toContain('no disponible');
  });
  it('can return to plot weather and cancels city search when destroyed', async () => {
    const { fixture, component, http } = await setup();
    http.expectOne('/api/v1/plots/plot/weather/current').flush(response());
    component.cityResults.set([city]);
    component.chooseCity(city);
    fixture.detectChanges();
    http
      .expectOne(`/api/v1/plots/plot/weather/current?cityId=${city.id}`)
      .flush({ ...response(), city });
    component.usePlotLocation();
    fixture.detectChanges();
    http.expectOne('/api/v1/plots/plot/weather/current').flush(response());
    component.cityQuery.setValue('Chone');
    component.searchCities();
    const pending = http.expectOne('/api/v1/plots/plot/weather/cities?name=Chone');
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    http.verify();
  });
  it.each([
    [0, 'Despejado'],
    [3, 'Nublado'],
    [45, 'Niebla'],
    [51, 'Llovizna'],
    [63, 'Lluvia'],
    [75, 'Nieve'],
    [95, 'Tormenta'],
    [null, 'Condición no disponible'],
  ] as const)('maps weather code %s without deriving it from soil moisture', (code, label) => {
    expect(weatherAppearance(code, false).label).toBe(label);
  });
});
