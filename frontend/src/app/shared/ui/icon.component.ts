import { Component, input } from '@angular/core';

const paths = {
  leaf: 'M20 4C10 2 3 7 5 15c2 7 13 6 15-11ZM5 20 16 9M10 15v-5m0 5h5',
  home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
  monitor: 'M3 4h18v13H3ZM8 21h8m-4-4v4M6 12l4-4 4 4 4-5',
  plots: 'M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z',
  camera: 'M3 7h4l2-3h6l2 3h4v14H3ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  history: 'M3 4v6h6M3 10a9 9 0 1 1 1 8m8-12v6l4 2',
  water: 'M12 2C9 7 4 11 4 15a8 8 0 0 0 16 0c0-4-5-8-8-13ZM8 15c0 2 1 3 3 4',
  rain: 'M7 15H6a4 4 0 0 1-1-8 7 7 0 0 1 13-1 5 5 0 0 1 0 9M8 18l-1 3m6-3-1 3m6-3-1 3',
  alert: 'm12 3 10 18H2ZM12 9v5m0 3v1',
  report: 'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8m-8 4h8',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z',
  temperature: 'M10 14V5a2 2 0 0 1 4 0v9a5 5 0 1 1-4 0ZM12 8v10m6-12h3m-3 4h2',
  tap: 'M3 10h15a3 3 0 0 1 3 3v3h-5v-2H3ZM10 10V5m-4 0h8M19 19v2',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  check: 'm5 12 4 4L19 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
} as const;

export type IconName = keyof typeof paths;

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path [attr.d]="paths[name()]" />
  </svg>`,
  styles: [
    `
      :host {
        display: inline-flex;
        width: 1.25em;
        height: 1.25em;
        flex-shrink: 0;
        vertical-align: middle;
      }
      svg {
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class IconComponent {
  readonly name = input<IconName>('leaf');
  readonly paths = paths;
}
