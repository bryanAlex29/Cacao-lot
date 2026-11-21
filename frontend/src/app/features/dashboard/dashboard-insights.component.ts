import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard-insights',
  standalone: true,
  template: `<div class="top">
      <section class="water">
        <h2>Agua y consumo</h2>
        <p>Consumo <strong>No disponible</strong></p>
        <p>Ahorro <strong>No calculable</strong></p>
        <span class="note">Requiere caudal calibrado y línea base verificable.</span>
      </section>
      <section class="alerts">
        <h2>Alertas</h2>
        <p>Motor de alertas pendiente.</p>
        <span class="note"
          >La ausencia de alertas no confirma condiciones normales del cultivo.</span
        >
      </section>
    </div>
    <section class="ods">
      <h2>Compromiso con el territorio</h2>
      <div>
        <article><b>6</b><span>Agua limpia y saneamiento</span></article>
        <article><b>12</b><span>Producción y consumo responsables</span></article>
        <article><b>13</b><span>Acción por el clima</span></article>
      </div>
      <p class="note">Objetivos de diseño; no resultados de impacto medidos.</p>
    </section>`,
  styles: [
    `
      :host {
        display: grid;
        gap: 14px;
        min-width: 0;
      }
      section {
        background: white;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 20px;
        min-width: 0;
      }
      h2 {
        font-size: 17px;
        margin: 0 0 18px;
      }
      .top {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .note {
        font-size: 11px;
        color: var(--muted);
        line-height: 1.7;
      }
      .water p {
        background: #f5f7f5;
        border-radius: 8px;
        padding: 10px;
        font-size: 11px;
        color: var(--muted);
      }
      .water strong {
        display: block;
        color: #174f35;
        font-size: 14px;
        margin-top: 6px;
      }
      .alerts p {
        font-size: 13px;
        color: #526158;
      }
      .ods > div {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .ods article {
        border-radius: 8px;
        color: white;
        background: #086b80;
        padding: 12px 10px;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .ods article:nth-child(2) {
        background: #9c5b08;
      }
      .ods article:nth-child(3) {
        background: #267135;
      }
      .ods b {
        font-size: 29px;
      }
      .ods span {
        font-size: 10px;
        line-height: 1.5;
      }
      @media (max-width: 1250px) {
        section {
          padding: 16px;
        }
      }
      @media (max-width: 620px) {
        section {
          padding: 14px;
        }
        .top {
          grid-template-columns: 1fr;
        }
        .ods article {
          display: block;
        }
        .ods span {
          display: block;
        }
      }
    `,
  ],
})
export class DashboardInsightsComponent {}
