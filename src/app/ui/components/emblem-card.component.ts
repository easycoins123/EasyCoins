import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The EasyCoins card.
 *
 * The idea "Ultimate Team" is a card; the reference shows one. Ours is an
 * original object: a tall card with a champagne frame on black glass, a
 * football drawn in gold line on the face, the brand's E as the emblem and a
 * ribbon of the coin's prism along the top. No player, no rating, no
 * position, no club, no nation, no stat block: nothing that is another
 * company's card. It reads as "card" and "football" from across the room and
 * as EasyCoins up close, and the component boundary is where an approved
 * asset could be substituted later without touching the scene around it.
 */
@Component({
  selector: 'tt-emblem-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="card" viewBox="0 0 200 300" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient [attr.id]="id('frame')" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0" stop-color="#F7EBCB"/>
          <stop offset="0.45" stop-color="#D4B46A"/>
          <stop offset="0.8" stop-color="#8A6B36"/>
          <stop offset="1" stop-color="#D4B46A"/>
        </linearGradient>
        <linearGradient [attr.id]="id('glass')" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#1F1C17"/>
          <stop offset="0.5" stop-color="#100E0B"/>
          <stop offset="1" stop-color="#070605"/>
        </linearGradient>
        <linearGradient [attr.id]="id('prism')" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#E6CB86"/><stop offset="0.35" stop-color="#F4E6C3"/>
          <stop offset="0.6" stop-color="#CFC2FF"/><stop offset="0.85" stop-color="#8FE3D6"/><stop offset="1" stop-color="#E6CB86"/>
        </linearGradient>
        <linearGradient [attr.id]="id('sheen')" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
          <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.02"/>
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
        <pattern [attr.id]="id('hex')" width="18" height="15.6" patternUnits="userSpaceOnUse">
          <path d="M9 0 L18 5.2 L18 10.4 L9 15.6 L0 10.4 L0 5.2 Z" fill="none" stroke="#D4B46A" stroke-opacity="0.16" stroke-width="0.8"/>
        </pattern>
      </defs>

      <!-- the card: a tall shape with a shoulder at the top, like a crest -->
      <path d="M20 26 Q20 12 34 12 L100 4 L166 12 Q180 12 180 26 L180 268 Q180 284 164 288 L100 296 L36 288 Q20 284 20 268 Z"
            [attr.fill]="'url(#' + id('frame') + ')'"/>
      <path d="M26 30 Q26 18 38 18 L100 10 L162 18 Q174 18 174 30 L174 266 Q174 279 161 282 L100 290 L39 282 Q26 279 26 266 Z"
            [attr.fill]="'url(#' + id('glass') + ')'"/>
      <path d="M26 30 Q26 18 38 18 L100 10 L162 18 Q174 18 174 30 L174 266 Q174 279 161 282 L100 290 L39 282 Q26 279 26 266 Z"
            [attr.fill]="'url(#' + id('hex') + ')'"/>
      <path d="M26 30 Q26 18 38 18 L100 10 L162 18 Q174 18 174 30 L174 266 Q174 279 161 282 L100 290 L39 282 Q26 279 26 266 Z"
            [attr.fill]="'url(#' + id('sheen') + ')'"/>
      <!-- the prism ribbon -->
      <path d="M40 40 L100 33 L160 40" fill="none" [attr.stroke]="'url(#' + id('prism') + ')'" stroke-width="2.2" stroke-linecap="round"/>

      <!-- the emblem -->
      <g transform="translate(100 72)">
        <path d="M0 -24 L22 -12 L22 12 L0 24 L-22 12 L-22 -12 Z" [attr.fill]="'url(#' + id('frame') + ')'"/>
        <path d="M0 -19 L17.5 -9.5 L17.5 9.5 L0 19 L-17.5 9.5 L-17.5 -9.5 Z" fill="#0C0A08"/>
        <g transform="translate(-11 -11) scale(0.34)" [attr.fill]="'url(#' + id('frame') + ')'">
          <g transform="translate(5,0) skewX(-8)">
            <rect x="14" y="12" width="10" height="40" rx="3"/><rect x="14" y="12" width="34" height="10" rx="5"/>
            <rect x="14" y="27" width="26" height="10" rx="5"/><rect x="14" y="42" width="34" height="10" rx="5"/>
          </g>
        </g>
      </g>

      <!-- the football, in gold line -->
      <g transform="translate(100 172)" fill="none" [attr.stroke]="'url(#' + id('frame') + ')'" stroke-width="2.2" stroke-linejoin="round">
        <circle r="56" [attr.fill]="'url(#' + id('glass') + ')'" stroke-width="3"/>
        <path d="M0 -20 L19 -6 L12 16 L-12 16 L-19 -6 Z" [attr.fill]="'url(#' + id('frame') + ')'" stroke="none" opacity="0.95"/>
        <path d="M0 -20 L0 -44 M19 -6 L42 -14 M12 16 L26 36 M-12 16 L-26 36 M-19 -6 L-42 -14"/>
        <path d="M0 -44 L-24 -50 M0 -44 L24 -50 M42 -14 L52 6 M26 36 L20 54 M-26 36 L-20 54 M-42 -14 L-52 6"/>
      </g>

      <!-- the name plate -->
      <rect x="44" y="238" width="112" height="26" rx="4" fill="#0C0A08" [attr.stroke]="'url(#' + id('frame') + ')'" stroke-width="1.2"/>
      <text x="100" y="256" text-anchor="middle" font-family="Heebo, sans-serif" font-weight="900" font-size="13" letter-spacing="3"
            [attr.fill]="'url(#' + id('frame') + ')'">EASYCOINS</text>
    </svg>
  `,
  styles: [`
    :host { display: block; line-height: 0; }
    .card { display: block; inline-size: 100%; block-size: auto; overflow: visible; }
  `],
})
export class EmblemCardComponent {
  @Input() alt = '';
  private readonly uid = Math.random().toString(36).slice(2, 8);
  id(part: string): string {
    return `ec-emblem-${this.uid}-${part}`;
  }
}
