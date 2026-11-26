import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent, IconName } from './icon.component';

export type DashboardSection = 'readings' | 'history' | 'irrigation-history' | 'alerts' | 'reports';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <aside class="sidebar" (keydown.escape)="dismissMenu($event)">
      <a class="brand" routerLink="/parcelas" aria-label="CacaoSmart IoT · Mis parcelas">
        <span class="brand-mark"><app-icon name="leaf" /></span>
        <strong>CacaoSmart <small>IoT</small></strong>
      </a>
      <p class="brand-caption">Riego inteligente para<br />cultivos de cacao</p>
      <button
        #menuToggle
        class="menu-toggle"
        type="button"
        [attr.aria-expanded]="expanded()"
        aria-controls="main-navigation"
        (click)="expanded.set(!expanded())"
      >
        <app-icon name="menu" /> Menú
      </button>
      <nav
        id="main-navigation"
        aria-label="Navegación principal"
        [class.expanded]="expanded()"
        (click)="closeOnNavigation($event)"
      >
        @if (plotId()) {
          <a
            [routerLink]="dashboardRoute()"
            [class.active]="active() === 'dashboard'"
            [attr.aria-current]="active() === 'dashboard' ? 'page' : null"
          >
            <app-icon name="home" /> Inicio
          </a>
          <a
            [routerLink]="sectionRoute()"
            fragment="readings"
            queryParamsHandling="preserve"
            (click)="selectSection('readings')"
            ><app-icon name="monitor" /> Monitoreo</a
          >
        }
        <a
          routerLink="/parcelas"
          [class.active]="active() === 'plots'"
          [attr.aria-current]="active() === 'plots' ? 'page' : null"
        >
          <app-icon name="plots" /> Parcelas
        </a>
        <a
          routerLink="/diagnostico-ia"
          [queryParams]="plotId() ? { plotId: plotId() } : {}"
          [class.active]="active() === 'diagnosis'"
          [attr.aria-current]="active() === 'diagnosis' ? 'page' : null"
        >
          <app-icon name="camera" /> Diagnóstico IA
        </a>
        @if (plotId()) {
          @for (item of sections; track item.fragment) {
            <a
              [routerLink]="sectionRoute()"
              [fragment]="item.fragment"
              queryParamsHandling="preserve"
              (click)="selectSection(item.fragment)"
              ><app-icon [name]="item.icon" /> {{ item.label }}</a
            >
            @if (item.fragment === 'irrigation-history') {
              <span class="pending"
                ><app-icon name="water" /><span
                  >Consumo de agua<small>No disponible</small></span
                ></span
              >
            }
          }
        }
        @if (!plotId()) {
          <span class="pending"
            ><app-icon name="water" /><span>Consumo de agua<small>No disponible</small></span></span
          >
        }
        <span class="pending"
          ><app-icon name="settings" /><span
            >Configuración<small>Gestión desde Parcelas y sensores</small></span
          ></span
        >
        @if (plotId()) {
          <a
            [routerLink]="['/parcelas', plotId(), 'clima']"
            [class.active]="active() === 'weather'"
            [attr.aria-current]="active() === 'weather' ? 'page' : null"
          >
            <app-icon name="rain" /> Clima histórico
          </a>
          <a
            [routerLink]="['/parcelas', plotId(), 'prediccion']"
            [class.active]="active() === 'prediction'"
            [attr.aria-current]="active() === 'prediction' ? 'page' : null"
          >
            <app-icon name="water" /> Predicción hídrica <small>No disponible</small>
          </a>
        }
      </nav>
      <div class="sidebar-footer">
        <app-icon name="leaf" /><strong>TerriTech</strong>
        <p>Hackathon CITIC 2026<br />Chone · Manabí</p>
        <a routerLink="/estado">Estado técnico</a>
      </div>
    </aside>
  `,
  styleUrl: './app-sidebar.component.css',
})
export class AppSidebarComponent {
  readonly plotId = input<string | null>(null);
  readonly active = input<'dashboard' | 'plots' | 'diagnosis' | 'weather' | 'prediction'>('plots');
  readonly expanded = signal(false);
  private readonly menuToggle = viewChild<ElementRef<HTMLButtonElement>>('menuToggle');
  readonly sectionSelected = output<DashboardSection>();
  readonly sections: { fragment: DashboardSection; label: string; icon: IconName }[] = [
    { fragment: 'history', label: 'Historial', icon: 'history' },
    { fragment: 'irrigation-history', label: 'Riego', icon: 'tap' },
    { fragment: 'alerts', label: 'Alertas', icon: 'alert' },
    { fragment: 'reports', label: 'Reportes', icon: 'report' },
  ];
  dashboardRoute(): string[] {
    return ['/parcelas', this.plotId() ?? '', 'dashboard'];
  }
  sectionRoute(): string[] {
    return this.active() === 'dashboard' ? [] : this.dashboardRoute();
  }
  selectSection(section: DashboardSection): void {
    this.expanded.set(false);
    this.sectionSelected.emit(section);
  }
  dismissMenu(event: Event): void {
    if (!this.expanded()) return;
    event.preventDefault();
    event.stopPropagation();
    this.expanded.set(false);
    this.menuToggle()?.nativeElement.focus();
  }
  closeOnNavigation(event: Event): void {
    if (event.target instanceof Element && event.target.closest('a')) this.expanded.set(false);
  }
}
