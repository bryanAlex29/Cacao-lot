import { Component, computed, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, interval, of, startWith, Subscription, switchMap, tap, timeout } from 'rxjs';
import type { CurrentWeather, WeatherCity, WeatherCitySearch } from '@cacaosmart/contracts';

export function checkedCity(city: WeatherCity): WeatherCity {
  if (
    !city ||
    !Number.isSafeInteger(city.id) ||
    city.id < 1 ||
    city.id > 2147483647 ||
    typeof city.name !== 'string' ||
    !city.name.trim() ||
    city.name.length > 200 ||
    typeof city.country !== 'string' ||
    !city.country.trim() ||
    city.country.length > 200 ||
    typeof city.countryCode !== 'string' ||
    !/^[A-Z]{2}$/.test(city.countryCode) ||
    (city.region !== null && (typeof city.region !== 'string' || city.region.length > 200))
  )
    throw new Error('Ciudad incompatible');
  return city;
}
export function cityLabel(city: WeatherCity): string {
  return [city.name, city.region, city.country].filter(Boolean).join(', ');
}

export function checkedCurrentWeather(value: CurrentWeather, plotId: string): CurrentWeather {
  if (
    !value ||
    value.plotId !== plotId ||
    !['available', 'disabled', 'location_required'].includes(value.status)
  )
    throw new Error('Clima incompatible');
  const c = value.current;
  if (value.status !== 'available') {
    if (c !== null) throw new Error('Clima incompatible');
    return value;
  }
  if (
    !c ||
    c.provider !== 'Open-Meteo' ||
    c.quality !== 'modeled' ||
    !Number.isFinite(Date.parse(c.observedAt)) ||
    !Number.isFinite(Date.parse(c.fetchedAt)) ||
    Date.now() - Date.parse(c.observedAt) > 3600000 ||
    Date.parse(c.observedAt) - Date.now() > 900000 ||
    !Number.isInteger(c.intervalSeconds) ||
    c.intervalSeconds < 1 ||
    c.intervalSeconds > 3600 ||
    (c.isDay !== null && typeof c.isDay !== 'boolean')
  )
    throw new Error('Clima incompatible');
  for (const [value, min, max] of [
    [c.temperatureC, -100, 70],
    [c.apparentTemperatureC, -120, 90],
    [c.humidityPct, 0, 100],
    [c.precipitationMm, 0, 1000],
    [c.weatherCode, 0, 99],
  ]) {
    if (
      value !== null &&
      (typeof value !== 'number' || !Number.isFinite(value) || value < min! || value > max!)
    )
      throw new Error('Clima incompatible');
  }
  return value;
}
export function weatherAppearance(code: number | null, isDay: boolean | null) {
  if (code === 0) return { icon: isDay === false ? '🌙' : '☀️', label: 'Despejado' };
  if (code === 1 || code === 2)
    return { icon: isDay === false ? '☁️' : '🌤️', label: 'Parcialmente nublado' };
  if (code === 3) return { icon: '☁️', label: 'Nublado' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Niebla' };
  if (code !== null && [51, 53, 55, 56, 57].includes(code))
    return { icon: '🌦️', label: 'Llovizna' };
  if (code !== null && [61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return { icon: '🌧️', label: 'Lluvia' };
  if (code !== null && [71, 73, 75, 77, 85, 86].includes(code))
    return { icon: '🌨️', label: 'Nieve' };
  if (code !== null && [95, 96, 97, 99].includes(code)) return { icon: '⛈️', label: 'Tormenta' };
  return { icon: '🌡️', label: 'Condición no disponible' };
}

@Component({
  selector: 'app-current-weather-card',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, ReactiveFormsModule],
  templateUrl: './current-weather-card.component.html',
  styleUrl: './current-weather-card.component.css',
})
export class CurrentWeatherCardComponent {
  readonly plotId = input.required<string>();
  readonly location = input('');
  readonly data = signal<CurrentWeather | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly cityPickerOpen = signal(false);
  readonly selectedCity = signal<WeatherCity | null>(null);
  readonly cityResults = signal<WeatherCity[]>([]);
  readonly citySearchBusy = signal(false);
  readonly citySearchMessage = signal('');
  readonly cityQuery = new FormControl('', { nonNullable: true });
  readonly cityLabel = cityLabel;
  readonly displayedLocation = computed(() => {
    const city = this.data()?.city ?? this.selectedCity();
    return city ? cityLabel(city) : this.location() || 'Ubicación de la parcela';
  });
  private cityRequest = new Subscription();
  private readonly refresh = signal(0);
  private readonly http = inject(HttpClient);
  readonly appearance = weatherAppearance;
  constructor() {
    const destroy = inject(DestroyRef);
    effect(() => {
      this.plotId();
      this.cityRequest.unsubscribe();
      this.selectedCity.set(null);
      this.cityPickerOpen.set(false);
      this.cityResults.set([]);
      this.citySearchBusy.set(false);
      this.citySearchMessage.set('');
      this.cityQuery.setValue('', { emitEvent: false });
    });
    this.cityQuery.valueChanges.pipe(takeUntilDestroyed(destroy)).subscribe(() => {
      this.cityRequest.unsubscribe();
      this.citySearchBusy.set(false);
      this.cityResults.set([]);
      this.citySearchMessage.set('');
    });
    destroy.onDestroy(() => this.cityRequest.unsubscribe());
    effect((cleanup) => {
      const id = this.plotId();
      const city = this.selectedCity();
      this.refresh();
      this.data.set(null);
      this.error.set('');
      this.busy.set(false);
      if (!id) return;
      const subscription = interval(15 * 60000)
        .pipe(
          startWith(0),
          tap(() => {
            this.busy.set(true);
            this.error.set('');
            this.data.set(null);
          }),
          switchMap(() =>
            this.http
              .get<CurrentWeather>(`/api/v1/plots/${encodeURIComponent(id)}/weather/current`, {
                params: city ? { cityId: city.id } : {},
              })
              .pipe(
                timeout(10000),
                switchMap((response) => {
                  const value = checkedCurrentWeather(response, id);
                  if (
                    city &&
                    value.status === 'available' &&
                    (!value.city || checkedCity(value.city).id !== city.id)
                  )
                    throw new Error('Ciudad incompatible');
                  if (!city && value.city) throw new Error('Ubicación incompatible');
                  return of(value);
                }),
                catchError(() => {
                  this.error.set('Clima actual no disponible. Reintenta más tarde.');
                  return of(null);
                }),
              ),
          ),
        )
        .subscribe((data) => {
          this.data.set(data);
          this.busy.set(false);
        });
      cleanup(() => subscription.unsubscribe());
    });
  }
  reload(): void {
    if (!this.busy()) this.refresh.update((n) => n + 1);
  }
  toggleCityPicker(): void {
    this.cityPickerOpen.update((open) => !open);
    if (!this.cityPickerOpen()) {
      this.cityRequest.unsubscribe();
      this.citySearchBusy.set(false);
    }
  }
  searchCities(): void {
    const name = this.cityQuery.value.trim(),
      plotId = this.plotId();
    this.cityRequest.unsubscribe();
    this.cityResults.set([]);
    this.citySearchBusy.set(false);
    this.citySearchMessage.set('');
    if (
      !plotId ||
      name.length < 2 ||
      name.length > 80 ||
      !/^[\p{L}\p{M}\p{N} .,'’()-]+$/u.test(name)
    ) {
      this.citySearchMessage.set('Escribe una ciudad de 2 a 80 caracteres.');
      return;
    }
    this.citySearchBusy.set(true);
    this.cityRequest = this.http
      .get<WeatherCitySearch>(`/api/v1/plots/${encodeURIComponent(plotId)}/weather/cities`, {
        params: { name },
      })
      .pipe(timeout(10000))
      .subscribe({
        next: (response) => {
          try {
            if (
              !response ||
              response.plotId !== plotId ||
              !['available', 'disabled'].includes(response.status) ||
              !Array.isArray(response.items) ||
              response.items.length > 5 ||
              (response.status === 'disabled' && response.items.length)
            )
              throw new Error('Búsqueda incompatible');
            const cities = response.items.map(checkedCity);
            if (new Set(cities.map((city) => city.id)).size !== cities.length)
              throw new Error('Búsqueda incompatible');
            this.cityResults.set(cities);
            this.citySearchMessage.set(
              response.status === 'disabled'
                ? 'Servicio meteorológico desactivado. Requiere habilitación en el servidor.'
                : cities.length
                  ? 'Selecciona la ciudad y región correctas.'
                  : 'No se encontraron ciudades. Prueba otro nombre o añade el país.',
            );
          } catch {
            this.citySearchMessage.set('No se pudieron buscar ciudades. Vuelve a intentarlo.');
          }
          this.citySearchBusy.set(false);
        },
        error: () => {
          this.citySearchBusy.set(false);
          this.citySearchMessage.set('No se pudieron buscar ciudades. Vuelve a intentarlo.');
        },
      });
  }
  chooseCity(city: WeatherCity): void {
    if (!this.cityResults().some((result) => result.id === city.id)) return;
    this.selectedCity.set(city);
    this.cityPickerOpen.set(false);
    this.cityResults.set([]);
    this.citySearchMessage.set('');
    this.cityRequest.unsubscribe();
    this.citySearchBusy.set(false);
  }
  usePlotLocation(): void {
    this.selectedCity.set(null);
    this.cityPickerOpen.set(false);
    this.cityRequest.unsubscribe();
    this.citySearchBusy.set(false);
  }
}
