import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-diagnosis-preview',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `<section>
    <span class="eyebrow">FOTOGRAFÍAS PRIVADAS · CONSENTIMIENTO</span>
    <h2>Diagnóstico de plantas con IA</h2>
    <div class="content">
      <div class="plant" aria-hidden="true">
        <app-icon name="camera" /><span>Tu próxima fotografía</span>
      </div>
      <div>
        <h3>Una mirada más a tu cultivo</h3>
        <p>
          Abre la subida privada de fotografías y revisa el proveedor antes de autorizar. Con OpenAI
          se envía la foto para un análisis orientativo. El proveedor simulado no evalúa
          enfermedades reales ni envía fotos a OpenAI.
        </p>
        <div class="actions">
          <a class="capture" routerLink="/diagnostico-ia" [queryParams]="{ plotId: plotId() }">
            <app-icon name="camera" /> Tomar foto o subir imagen
          </a>
        </div>
        <p class="navigation-note">Abre la pantalla de captura para elegir y confirmar tu foto.</p>
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
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-card);
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
        background: radial-gradient(ellipse at top, #e4efd7, #f5f9ef);
        color: #396746;
        font-size: 40px;
        line-height: 1.1;
        border-radius: 18px;
        padding: 24px 16px;
        min-width: 125px;
        text-align: center;
        border: 1px solid #cfddc7;
      }
      .plant span {
        display: block;
        font-size: 10px;
        margin-top: 14px;
        line-height: 1.5;
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
      .capture {
        font-size: 12px;
        padding: 11px 14px;
        min-height: 44px;
        border-radius: 11px;
        background: var(--green);
        color: white;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        line-height: 1.5;
      }
      .navigation-note {
        font-size: 10px;
        margin: 8px 0 0;
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
          font-size: 32px;
          min-width: 76px;
          padding: 16px 8px;
        }
      }
    `,
  ],
})
export class DiagnosisPreviewComponent {
  readonly plotId = input<string | null>(null);
}
