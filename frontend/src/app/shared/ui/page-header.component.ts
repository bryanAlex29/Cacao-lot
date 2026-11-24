import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { AccountUser, DataSource } from '@cacaosmart/contracts';
import { IconComponent } from './icon.component';

export interface HeaderConnection {
  label: string;
  healthy: boolean;
  timestamp: string | null;
  source: DataSource;
}

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [DatePipe, RouterLink, IconComponent],
  template: `<header class="page-header">
    <div class="context">
      <span class="context-icon"><app-icon name="leaf" /></span>
      <div class="context-copy">
        <span class="eyebrow">{{ section() }}</span>
        @if (primaryHeading()) {
          <h1>{{ title() }}</h1>
        } @else {
          <p class="context-title">{{ title() }}</p>
        }
        <p class="location">{{ subtitle() }}</p>
        @if (canChangePlot()) {
          <a class="change-plot" routerLink="/parcelas"
            >Cambiar parcela <app-icon name="arrow"
          /></a>
        }
      </div>
    </div>
    <div class="header-actions">
      @if (connection(); as status) {
        <div class="connection">
          <span class="connection-badge" [class.healthy]="status.healthy && !!status.timestamp">
            <span aria-hidden="true" class="connection-dot"></span>
            {{ status.source === 'demo' ? 'DEMO' : 'REAL' }} · {{ status.label }}
          </span>
          <span class="last-reading">
            {{
              status.timestamp
                ? 'Última lectura: ' + (status.timestamp | date: 'dd/MM HH:mm:ss')
                : 'Sin lecturas disponibles'
            }}
          </span>
        </div>
      }
      <div class="account">
        <span class="avatar"><app-icon name="user" /></span>
        <div class="account-copy">
          <strong>{{ user()?.name || 'Sesión no disponible' }}</strong>
          @if (user(); as current) {
            <span>{{ current.role === 'ADMIN' ? 'Administrador' : 'Agricultor' }}</span>
          }
        </div>
        <button type="button" title="Cerrar sesión" [disabled]="!user()" (click)="signOut.emit()">
          Salir
        </button>
      </div>
    </div>
  </header>`,
  styleUrl: './page-header.component.css',
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly section = input('CACAO SMART · TU CULTIVO');
  readonly user = input<Pick<AccountUser, 'name' | 'role'> | null>(null);
  readonly primaryHeading = input(false);
  readonly canChangePlot = input(false);
  readonly connection = input<HeaderConnection | null>(null);
  readonly signOut = output<void>();
}
