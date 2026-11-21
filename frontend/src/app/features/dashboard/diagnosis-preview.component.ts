import { Component } from '@angular/core';

@Component({
  selector: 'app-diagnosis-preview',
  standalone: true,
  template: `<section>
    <span class="eyebrow">PRÓXIMA FASE</span>
    <h2>Diagnóstico de plantas con IA</h2>
    <div class="content">
      <div class="plant" aria-hidden="true">❧</div>
      <div>
        <h3>Una mirada más a tu cultivo</h3>
        <p>
          La captura de fotografías y el análisis orientativo se incorporarán en su fase. No se ha
          analizado ninguna imagen.
        </p>
        <span class="pending">Cámara y análisis aún no disponibles</span>
      </div>
    </div>
    <p class="info">El análisis será orientativo, no un diagnóstico agronómico definitivo.</p>
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      section {
        height: 100%;
        background: white;
        border: 1px solid var(--border);
        border-radius: 14px;
        padding: 20px;
      }
      .eyebrow {
        font-size: 10px;
        letter-spacing: 1.5px;
        font-weight: bold;
        color: var(--muted);
      }
      h2 {
        font-size: 17px;
        margin: 8px 0 18px;
      }
      .content {
        display: flex;
        gap: 20px;
        align-items: center;
      }
      .plant {
        background: #e8f7e6;
        color: #387e3e;
        font-size: 100px;
        line-height: 1.1;
        border-radius: 12px;
        padding: 12px;
      }
      h3 {
        font-size: 15px;
        margin: 0;
      }
      p {
        font-size: 12px;
        color: var(--muted);
        line-height: 1.7;
      }
      .pending {
        font-size: 11px;
        padding: 6px 9px;
        border-radius: 7px;
        background: #f2f4ef;
        color: #526158;
        display: inline-block;
      }
      .info {
        background: #e7f3f9;
        color: #14526f;
        border-radius: 8px;
        padding: 10px;
        font-size: 10px;
        margin-bottom: 0;
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
        .content {
          gap: 12px;
        }
        .plant {
          font-size: 70px;
          padding: 4px;
        }
      }
    `,
  ],
})
export class DiagnosisPreviewComponent {}
