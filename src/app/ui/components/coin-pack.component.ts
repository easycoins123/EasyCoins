import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MATERIAL_BY_STEP, PackMaterial } from '../materials';

export type { PackMaterial };
export { MATERIAL_BY_STEP };

/**
 * A collector's audience reads value as material before it reads a number.
 * The palette is our own; only the idea of a progression is borrowed from the
 * genre.
 */
interface Palette {
  readonly light: string;
  readonly mid: string;
  readonly dark: string;
  readonly deep: string;
  /** The stage light behind the object. */
  readonly glow: string;
  readonly body: string;
}

const PALETTES: Record<PackMaterial, Palette> = {
  steel: { light: '#E6ECF4', mid: '#9AA7B8', dark: '#5C6879', deep: '#2B333F', glow: '#6E93FF', body: '#171A1F' },
  bronze: { light: '#F3D3B8', mid: '#C98A5A', dark: '#8C5A34', deep: '#4A2C16', glow: '#D9824A', body: '#1D1512' },
  silver: { light: '#FFFFFF', mid: '#D6DEE8', dark: '#8E9AA8', deep: '#4B5563', glow: '#A8C0FF', body: '#15181D' },
  gold: { light: '#FFF3D2', mid: '#F2B33D', dark: '#B8790F', deep: '#7A4E10', glow: '#F2B33D', body: '#14110D' },
  elite: { light: '#FFF6DC', mid: '#F6C95E', dark: '#6B4A12', deep: '#1A1206', glow: '#FFD371', body: '#0A0908' },
};

interface FannedCard {
  readonly rot: number;
  readonly dx: number;
  readonly dy: number;
  readonly dim: number;
}

/**
 * A EASYCOINS pack.
 *
 * The product object. A tall card with a milled double frame, a struck
 * medallion where a pack shows its contents, a denomination plate, coins
 * spilling at the base, and, from the second tier up, player cards fanning out
 * behind it: the moment a pack is opened, which is the moment this audience
 * buys coins for.
 *
 * Everything scales with the tier. Material climbs from steel to an obsidian
 * elite with a moving foil sheen; the card count, the coin count and the
 * stage light climb with it. Five distinct objects rather than one object with
 * more dots.
 *
 * Original throughout. The player cards carry an abstract silhouette and no
 * rating, position, name or crest, so nothing here is a publisher's card. The
 * cue is the format and the material, which is nobody's property.
 *
 * Inline SVG on per-instance gradient ids, so several packs on one page cannot
 * share a definition.
 */
@Component({
  selector: 'tt-coin-pack',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 200 250" class="pack"
         [class.pack--top]="steps >= 4"
         [class.pack--elite]="material === 'elite'"
         [attr.data-material]="material"
         aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="id('body')" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" [attr.stop-color]="palette.body" stop-opacity="1"/>
          <stop offset="0.5" stop-color="#0E0C0A"/>
          <stop offset="1" stop-color="#07060A"/>
        </linearGradient>
        <linearGradient [attr.id]="id('trim')" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" [attr.stop-color]="palette.light"/>
          <stop offset="0.35" [attr.stop-color]="palette.mid"/>
          <stop offset="0.7" [attr.stop-color]="palette.dark"/>
          <stop offset="1" [attr.stop-color]="palette.light"/>
        </linearGradient>
        <linearGradient [attr.id]="id('metal')" x1="0.15" y1="0" x2="0.7" y2="1">
          <stop offset="0" [attr.stop-color]="palette.light"/>
          <stop offset="0.34" [attr.stop-color]="palette.mid"/>
          <stop offset="0.72" [attr.stop-color]="palette.mid"/>
          <stop offset="1" [attr.stop-color]="palette.dark"/>
        </linearGradient>
        <linearGradient [attr.id]="id('edge')" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" [attr.stop-color]="palette.dark"/>
          <stop offset="1" [attr.stop-color]="palette.deep"/>
        </linearGradient>
        <radialGradient [attr.id]="id('stage')" cx="50%" cy="34%" r="62%">
          <stop offset="0" [attr.stop-color]="palette.glow" [attr.stop-opacity]="material === 'elite' ? 0.42 : 0.3"/>
          <stop offset="0.55" [attr.stop-color]="palette.glow" stop-opacity="0.12"/>
          <stop offset="1" [attr.stop-color]="palette.glow" stop-opacity="0"/>
        </radialGradient>
        <radialGradient [attr.id]="id('pool')" cx="50%" cy="50%" r="50%">
          <stop offset="0" [attr.stop-color]="palette.mid" stop-opacity="0.32"/>
          <stop offset="1" [attr.stop-color]="palette.mid" stop-opacity="0"/>
        </radialGradient>
        <linearGradient [attr.id]="id('sheen')" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
          <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.03"/>
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
        <!-- The foil: a narrow band of light that travels across the elite
             frame. Clipped to the card so it never paints the page. -->
        <linearGradient [attr.id]="id('foil')" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
          <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.35"/>
          <stop offset="0.5" [attr.stop-color]="palette.light" stop-opacity="0.65"/>
          <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.35"/>
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>
        <clipPath [attr.id]="id('clip')"><path [attr.d]="cardPath"/></clipPath>
      </defs>

      <!-- Stadium wash behind everything. -->
      <ellipse cx="100" cy="96" rx="96" ry="104" [attr.fill]="'url(#' + id('stage') + ')'"/>

      <!-- Player cards fanning out of the pack, from the second tier up. -->
      <g class="pack__cards">
        <g *ngFor="let card of cards"
           [attr.transform]="'translate(' + (100 + card.dx) + ',' + card.dy + ') rotate(' + card.rot + ')'"
           [attr.opacity]="card.dim">
          <rect x="-50" y="-68" width="100" height="136" rx="9"
                [attr.fill]="'url(#' + id('metal') + ')'"
                [attr.stroke]="palette.light" stroke-opacity="0.55" stroke-width="1.5"/>
          <rect x="-44" y="-62" width="88" height="124" rx="6"
                [attr.fill]="'url(#' + id('body') + ')'" opacity="0.62"/>
          <!-- An abstract player: head and shoulders, nothing more. -->
          <circle cx="0" cy="-26" r="13" [attr.fill]="palette.deep" opacity="0.85"/>
          <path d="M-36 40 C-36 6 -18 -6 0 -6 C18 -6 36 6 36 40 Z" [attr.fill]="palette.deep" opacity="0.85"/>
          <rect x="-44" y="42" width="88" height="14" [attr.fill]="palette.dark" opacity="0.55"/>
          <rect x="-44" y="-62" width="88" height="124" rx="6" [attr.fill]="'url(#' + id('sheen') + ')'"/>
        </g>
      </g>

      <g class="pack__card">
        <path [attr.d]="cardPath" [attr.fill]="'url(#' + id('body') + ')'"/>
        <!-- An etched grid on the body, the way a foil pack carries texture. -->
        <path [attr.d]="cardPath" fill="none" [attr.stroke]="palette.mid" stroke-opacity="0.06" stroke-width="18" stroke-dasharray="2 12"/>
        <!-- Double rule: the outer frame and a hairline inset from it. -->
        <path [attr.d]="cardPath" fill="none" [attr.stroke]="'url(#' + id('trim') + ')'" stroke-width="3"/>
        <path [attr.d]="innerPath" fill="none" [attr.stroke]="palette.mid" stroke-opacity="0.42" stroke-width="1"/>
        <path [attr.d]="cardPath" [attr.fill]="'url(#' + id('sheen') + ')'"/>

        <!-- Contents: a struck medallion where a pack shows what is inside. -->
        <g [attr.transform]="'translate(100,' + medallionY + ')'">
          <ellipse cx="0" cy="6" rx="54" ry="34" [attr.fill]="'url(#' + id('pool') + ')'"/>
          <polygon [attr.points]="octagon(0, 6, 42, 0.82, 10)" [attr.fill]="'url(#' + id('edge') + ')'"/>
          <polygon [attr.points]="octagon(0, 6, 42, 0.82)" [attr.fill]="'url(#' + id('metal') + ')'"/>
          <polygon [attr.points]="octagon(0, 6, 42 * 0.82, 0.82)" fill="none"
                   [attr.stroke]="palette.deep" stroke-opacity="0.34" stroke-width="1.6"/>
          <!-- A football struck into the face: pentagon and seams. -->
          <g transform="translate(0,6) scale(1.35,1.1)">
            <polygon points="0,-9 8.6,-2.8 5.3,7.3 -5.3,7.3 -8.6,-2.8" [attr.fill]="palette.deep" fill-opacity="0.72"/>
            <path d="M0 -9V-18M8.6 -2.8L17 -5.6M5.3 7.3L10.6 14.6M-5.3 7.3L-10.6 14.6M-8.6 -2.8L-17 -5.6"
                  fill="none" [attr.stroke]="palette.deep" stroke-opacity="0.72" stroke-width="2.4" stroke-linecap="round"/>
          </g>
        </g>

        <!-- Denomination plate. Blank of any figure: the quantity is set in
             real type beside the artwork, never baked into a picture. -->
        <g [attr.transform]="'translate(100,' + plateY + ')'">
          <rect x="-58" y="-10" width="116" height="20" rx="4" [attr.fill]="'url(#' + id('trim') + ')'" opacity="0.92"/>
          <rect x="-49" y="-5" width="98" height="3.4" rx="1.7" [attr.fill]="palette.deep" opacity="0.32"/>
          <rect x="-49" y="2" width="64" height="3.4" rx="1.7" [attr.fill]="palette.deep" opacity="0.22"/>
        </g>

        <!-- Foil sweep, elite only. -->
        <g *ngIf="material === 'elite'" [attr.clip-path]="'url(#' + id('clip') + ')'">
          <rect class="pack__foil" x="-90" y="0" width="90" height="250" [attr.fill]="'url(#' + id('foil') + ')'"/>
        </g>
      </g>

      <!-- Coins spilling at the base. Count climbs with the tier. -->
      <g class="pack__spill">
        <g *ngFor="let coin of spill">
          <polygon [attr.points]="octagon(coin.x, coin.y, coin.r, 0.58, coin.d)"
                   [attr.fill]="'url(#' + id('edge') + ')'" [attr.opacity]="coin.dim"/>
          <polygon [attr.points]="octagon(coin.x, coin.y, coin.r, 0.58)"
                   [attr.fill]="'url(#' + id('metal') + ')'" [attr.opacity]="coin.dim"/>
        </g>
      </g>
    </svg>
  `,
  styles: [`
    :host { display: block; inline-size: 100%; }
    .pack { inline-size: 100%; block-size: auto; display: block; overflow: visible; }

    /* Only the largest compositions move, and only barely. */
    .pack--top .pack__card { animation: tt-pack-float 7s var(--tt-ease) infinite alternate; }
    @keyframes tt-pack-float {
      from { transform: translateY(0); }
      to { transform: translateY(-3px); }
    }
    /* The foil crosses the elite frame every few seconds. */
    .pack__foil { animation: tt-pack-foil 5.5s var(--tt-ease) infinite; }
    @keyframes tt-pack-foil {
      0% { transform: translateX(0) skewX(-12deg); }
      45% { transform: translateX(300px) skewX(-12deg); }
      100% { transform: translateX(300px) skewX(-12deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .pack--top .pack__card, .pack__foil { animation: none; }
    }
  `],
})
export class CoinPackComponent {
  /**
   * Which tier, one through five. Drives the material, the cards fanning out,
   * the coin count and the lighting.
   */
  @Input() steps = 3;

  /** Overrides the material derived from `steps`. */
  @Input() set material(value: PackMaterial | undefined) {
    this.materialOverride = value;
  }
  get material(): PackMaterial {
    return this.materialOverride ?? MATERIAL_BY_STEP[Math.min(4, Math.max(0, this.steps - 1))];
  }
  private materialOverride?: PackMaterial;

  private readonly uid = Math.random().toString(36).slice(2, 8);

  id(part: string): string {
    return `ep-${part}-${this.uid}`;
  }

  get palette(): Palette {
    return PALETTES[this.material];
  }

  readonly cardPath = 'M38 22 H162 A9 9 0 0 1 171 31 V199 A9 9 0 0 1 162 208 '
    + 'H38 A9 9 0 0 1 29 199 V31 A9 9 0 0 1 38 22 Z';

  readonly innerPath = 'M44 30 H156 A4 4 0 0 1 160 34 V196 A4 4 0 0 1 156 200 '
    + 'H44 A4 4 0 0 1 40 196 V34 A4 4 0 0 1 44 30 Z';

  get medallionY(): number {
    return 92;
  }

  get plateY(): number {
    return 172;
  }

  /**
   * The cards behind the pack. Fixed arrangements per tier, so a given bundle
   * always looks identical; artwork that shifts between renders reads as a
   * fault.
   */
  get cards(): readonly FannedCard[] {
    const arrangements: FannedCard[][] = [
      [],
      [{ rot: -16, dx: -18, dy: 100, dim: 0.9 }],
      [{ rot: -20, dx: -22, dy: 102, dim: 0.85 }, { rot: 16, dx: 22, dy: 104, dim: 0.9 }],
      [{ rot: -24, dx: -28, dy: 104, dim: 0.8 }, { rot: 0, dx: 0, dy: 90, dim: 0.9 }, { rot: 20, dx: 26, dy: 104, dim: 0.85 }],
      [{ rot: -28, dx: -34, dy: 106, dim: 0.8 }, { rot: -6, dx: -8, dy: 88, dim: 0.9 }, { rot: 10, dx: 12, dy: 90, dim: 0.9 }, { rot: 26, dx: 34, dy: 106, dim: 0.85 }],
    ];
    return arrangements[Math.min(4, Math.max(0, this.steps - 1))];
  }

  get spill(): readonly { x: number; y: number; r: number; d: number; dim: number }[] {
    const all = [
      { x: 62, y: 206, r: 20, d: 7, dim: 1 },
      { x: 138, y: 204, r: 17, d: 6, dim: 0.94 },
      { x: 100, y: 218, r: 22, d: 8, dim: 1 },
      { x: 34, y: 216, r: 14, d: 5, dim: 0.86 },
      { x: 166, y: 216, r: 13, d: 5, dim: 0.8 },
      { x: 82, y: 232, r: 12, d: 4, dim: 0.72 },
    ];
    const counts = [1, 2, 3, 5, 6];
    return all.slice(0, counts[Math.min(4, Math.max(0, this.steps - 1))]);
  }

  /** An octagon in three-quarter view, matching the coin artwork's geometry. */
  octagon(cx: number, cy: number, r: number, squash: number, dy = 0): string {
    const points: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const angle = ((index * 45 + 22.5) * Math.PI) / 180;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r * squash + dy;
      points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return points.join(' ');
  }
}
