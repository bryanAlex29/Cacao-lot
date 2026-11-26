import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from '../../shared/ui/icon.component';
import { rainSimulationStages } from './rain-simulation.model';

/** Solo estado de componente; sin servicios HTTP, almacenamiento ni timers. */
@Component({
  selector: 'app-rain-simulation',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './rain-simulation.component.html',
  styleUrl: './rain-simulation.component.css',
})
export class RainSimulationComponent {
  readonly closed = output<void>();
  readonly stages = rainSimulationStages;
  readonly step = signal(0);
  readonly current = computed(() => this.stages[this.step()]);
  readonly last = computed(() => this.step() === this.stages.length - 1);
  private readonly heading = viewChild<ElementRef<HTMLHeadingElement>>('heading');

  constructor() {
    afterNextRender(() => this.heading()?.nativeElement.focus());
  }
  advance(): void {
    this.step.update((index) => Math.min(index + 1, this.stages.length - 1));
  }
  restart(): void {
    this.step.set(0);
  }
}
