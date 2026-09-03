import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ProcessStep = 'choose' | 'secure';

/**
 * The objects of the "how it works" cards.
 *
 * Original black-and-gold objects in the coin's material: for "choose", a
 * football in gold line with a controller and a package behind it; for
 * "secure", a shield of black glass with a gold lock and a payment card
 * behind it. The third step, "get your coins", is the coin stack itself,
 * drawn by `tt-coin-art`. No people, no logos, no platform marks.
 */
@Component({
  selector: 'tt-process-art',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="art" viewBox="0 0 200 140" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient [attr.id]="id('gold')" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" stop-color="#F7EBCB"/><stop offset="0.5" stop-color="#D4B46A"/><stop offset="1" stop-color="#8A6B36"/>
        </linearGradient>
        <linearGradient [attr.id]="id('glass')" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#2A2620"/><stop offset="0.55" stop-color="#14110D"/><stop offset="1" stop-color="#070605"/>
        </linearGradient>
        <radialGradient [attr.id]="id('light')" cx="50%" cy="60%" r="50%">
          <stop offset="0" stop-color="#D4B46A" stop-opacity="0.22"/><stop offset="1" stop-color="#D4B46A" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="88" rx="90" ry="46" [attr.fill]="'url(#' + id('light') + ')'"/>
      <ellipse cx="100" cy="122" rx="60" ry="8" fill="#000" opacity="0.45"/>

      <ng-container *ngIf="step === 'choose'">
        <!-- the package, behind -->
        <g transform="translate(128 44) rotate(-8)">
          <rect x="0" y="0" width="56" height="42" rx="6" [attr.fill]="'url(#' + id('glass') + ')'"/>
          <rect x="3" y="3" width="50" height="36" rx="4" fill="none" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="1.4" opacity="0.9"/>
          <rect x="0" y="16" width="56" height="9" [attr.fill]="'url(#' + id('gold') + ')'" opacity="0.9"/>
        </g>
        <!-- the controller -->
        <g transform="translate(112 86)">
          <path d="M8 0 h48 a14 14 0 0 1 14 14 l4 22 a8 8 0 0 1 -14 6 l-8 -10 h-40 l-8 10 a8 8 0 0 1 -14 -6 l4 -22 a14 14 0 0 1 14 -14 Z"
                [attr.fill]="'url(#' + id('glass') + ')'" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="1.4"/>
          <circle cx="50" cy="14" r="3" [attr.fill]="'url(#' + id('gold') + ')'"/><circle cx="58" cy="20" r="3" [attr.fill]="'url(#' + id('gold') + ')'"/>
          <path d="M12 14 h12 M18 8 v12" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="3" stroke-linecap="round"/>
        </g>
        <!-- the football, in front -->
        <g transform="translate(66 78)" fill="none" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="2.2" stroke-linejoin="round">
          <circle r="40" [attr.fill]="'url(#' + id('glass') + ')'" stroke-width="3"/>
          <path d="M0 -14 L13 -4 L8 11 L-8 11 L-13 -4 Z" [attr.fill]="'url(#' + id('gold') + ')'" stroke="none"/>
          <path d="M0 -14 L0 -31 M13 -4 L30 -10 M8 11 L18 26 M-8 11 L-18 26 M-13 -4 L-30 -10"/>
          <path d="M0 -31 L-17 -36 M0 -31 L17 -36 M30 -10 L37 4 M18 26 L14 39 M-18 26 L-14 39 M-30 -10 L-37 4"/>
        </g>
      </ng-container>

      <ng-container *ngIf="step === 'secure'">
        <!-- the card, behind -->
        <g transform="translate(96 40) rotate(-12)">
          <rect x="0" y="0" width="86" height="54" rx="7" [attr.fill]="'url(#' + id('glass') + ')'"/>
          <rect x="3" y="3" width="80" height="48" rx="5" fill="none" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="1.2" opacity="0.85"/>
          <rect x="0" y="14" width="86" height="8" fill="#000" opacity="0.7"/>
          <rect x="10" y="30" width="20" height="12" rx="2" [attr.fill]="'url(#' + id('gold') + ')'" opacity="0.9"/>
          <path d="M40 38 h30" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
        </g>
        <!-- the shield, in front -->
        <g transform="translate(62 30)">
          <path d="M40 0 L78 12 V44 C78 68 60 86 40 94 C20 86 2 68 2 44 V12 Z" [attr.fill]="'url(#' + id('gold') + ')'"/>
          <path d="M40 6 L72 16 V44 C72 64 57 80 40 87 C23 80 8 64 8 44 V16 Z" [attr.fill]="'url(#' + id('glass') + ')'"/>
          <rect x="27" y="42" width="26" height="22" rx="4" [attr.fill]="'url(#' + id('gold') + ')'"/>
          <path d="M31 42 v-6 a9 9 0 0 1 18 0 v6" fill="none" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="4"/>
          <circle cx="40" cy="52" r="3" fill="#0C0A08"/>
        </g>
      </ng-container>
    </svg>
  `,
  styles: [`
    :host { display: block; line-height: 0; }
    .art { display: block; inline-size: 100%; block-size: auto; overflow: visible; filter: drop-shadow(0 14px 18px rgba(0, 0, 0, 0.5)); }
  `],
})
export class ProcessArtComponent {
  @Input() step: ProcessStep = 'choose';
  private readonly uid = Math.random().toString(36).slice(2, 8);
  id(part: string): string {
    return `ec-process-${this.uid}-${part}`;
  }
}
