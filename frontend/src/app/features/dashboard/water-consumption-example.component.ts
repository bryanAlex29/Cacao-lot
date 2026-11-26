import { Component, computed, effect, input, signal } from '@angular/core';
import type { TelemetrySubscription } from '@cacaosmart/contracts';
import { waterConsumptionExample } from './water-consumption-example.model';

/** Ejemplo local sin HTTP, navegación, almacenamiento o dependencia del relé. */
@Component({
  selector: 'app-water-consumption-example',
  standalone: true,
  templateUrl: './water-consumption-example.component.html',
  styleUrl: './water-consumption-example.component.css',
})
export class WaterConsumptionExampleComponent {
  readonly selection = input<TelemetrySubscription | null>(null);
  readonly exampleOpen = signal(false);
  readonly example = waterConsumptionExample;
  readonly savedLiters = this.example.usualLiters - this.example.hypotheticalLiters;
  readonly savedPercent = (this.savedLiters / this.example.usualLiters) * 100;
  private readonly contextKey = computed(() => {
    const selection = this.selection();
    return selection ? `${selection.plotId}:${selection.deviceId}:${selection.source}` : null;
  });

  constructor() {
    effect(() => {
      this.contextKey();
      this.exampleOpen.set(false);
    });
  }

  toggleExample(): void {
    this.exampleOpen.update((open) => !open);
  }
}
