import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CoinTier } from '../../../domain';
import { ArtSource, CoinArtVariant, artSource } from './art-sources';
import { TIERS, Tier } from './tiers';

export type { CoinArtVariant } from './art-sources';

/** A coin lying on the stage, drawn as a top ellipse over a short edge. */
interface LyingCoin {
  readonly kind: 'lying';
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly ry: number;
  readonly t: number;
  readonly mark: boolean;
  readonly prism: boolean;
  readonly edgePath: string;
  readonly reedPath: string;
  readonly markTransform: string;
  readonly shadowTransform: string;
}

/** A coin standing on its edge, leaning against the stack. */
interface StandingCoin {
  readonly kind: 'standing';
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly tilt: number;
  readonly markTransform: string;
  readonly shadowTransform: string;
}

interface Ray {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface Scene {
  readonly viewBox: string;
  readonly width: number;
  readonly height: number;
  readonly floor: { cx: number; cy: number; rx: number; ry: number };
  readonly light: { cx: number; cy: number; rx: number; ry: number };
  readonly rays: readonly Ray[];
  readonly coins: readonly LyingCoin[];
  readonly standing?: StandingCoin;
  readonly sparks: readonly { x: number; y: number; r: number }[];
}

interface Geometry {
  readonly width: number;
  readonly height: number;
  readonly r: number;
  readonly t: number;
  readonly baseY: number;
  readonly stack: number;
  readonly standing: boolean;
  readonly scatter: number;
  readonly rays: number;
}

/** How many coins each tier stacks, per composition. More coins, more value. */
const STACKS: Readonly<Record<CoinArtVariant, Readonly<Record<CoinTier, number>>>> = {
  tile: { starter: 1, pro: 2, elite: 3, legend: 4 },
  card: { starter: 2, pro: 3, elite: 4, legend: 5 },
  quote: { starter: 2, pro: 3, elite: 4, legend: 5 },
  hero: { starter: 3, pro: 4, elite: 6, legend: 7 },
};

/** The E of the wordmark, as drawn in the brand lockup, in a 64-unit box. */
const MARK_BOX = 64;

/**
 * Original EasyCoins coin artwork.
 *
 * A stack of machined coins, struck with the brand's E, standing in a pool of
 * the tier's stage light. The stack grows with the tier; Elite and Legend get
 * a coin leaning against the stack, Legend a prismatic rim and a few loose
 * coins, and the hero composition a burst of light behind it all.
 *
 * Everything is inline SVG with the tier's material as gradient stops, so it
 * recolours with the theme and costs no request. For the compositions shown
 * large (card, quote, hero) a baked raster of the same drawing is registered
 * in `art-sources.ts` and used instead, AVIF first, WebP as fallback, the
 * vector when neither is registered; the tile composition is always vector.
 *
 * Decorative by default: the amount, tier and platform are text on the card.
 * Pass `alt` only where the art is the content.
 */
@Component({
  selector: 'tt-coin-art',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- AVIF, then WebP, then (with no raster registered) the vector below.
         The hero is the largest paint on the site, so it loads eagerly with
         priority; every other composition waits for its turn. -->
    <div *ngIf="raster as art; else drawn" class="raster">
      <!-- The stage light stays vector behind the raster: a gradient that
           recolours with the theme and never bands. -->
      <svg class="stage" [attr.viewBox]="scene.viewBox" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient [attr.id]="id('stage')" cx="50%" cy="50%" r="50%">
            <stop offset="0" [attr.stop-color]="palette.glow" [attr.stop-opacity]="variant === 'hero' ? 0.34 : 0.26"/>
            <stop offset="0.6" [attr.stop-color]="palette.glow" stop-opacity="0.08"/>
            <stop offset="1" [attr.stop-color]="palette.glow" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <ellipse [attr.cx]="scene.light.cx" [attr.cy]="scene.light.cy" [attr.rx]="scene.light.rx" [attr.ry]="scene.light.ry"
                 [attr.fill]="'url(#' + id('stage') + ')'"/>
        <g *ngIf="scene.rays.length > 0" [attr.stroke]="palette.rim" stroke-width="1" stroke-linecap="round" opacity="0.14">
          <line *ngFor="let ray of scene.rays" [attr.x1]="ray.x1" [attr.y1]="ray.y1" [attr.x2]="ray.x2" [attr.y2]="ray.y2"/>
        </g>
        <g *ngIf="scene.sparks.length > 0" [attr.fill]="palette.rim">
          <circle *ngFor="let spark of scene.sparks" [attr.cx]="spark.x" [attr.cy]="spark.y" [attr.r]="spark.r" opacity="0.7"/>
        </g>
      </svg>
      <picture>
        <source [srcset]="art.avif" type="image/avif" />
        <source [srcset]="art.webp" type="image/webp" />
        <img [src]="art.webp" [width]="art.width" [height]="art.height" [alt]="alt"
             [attr.loading]="variant === 'hero' ? 'eager' : 'lazy'"
             [attr.fetchpriority]="variant === 'hero' ? 'high' : null"
             decoding="async" />
      </picture>
    </div>

    <ng-template #drawn>
      <svg class="art" [class.art--hero]="variant === 'hero'"
           [attr.viewBox]="scene.viewBox"
           [attr.role]="alt ? 'img' : null"
           [attr.aria-label]="alt || null"
           [attr.aria-hidden]="alt ? null : 'true'"
           focusable="false">
        <defs>
          <linearGradient [attr.id]="id('face')" x1="0" y1="0" x2="0.9" y2="1">
            <stop offset="0" [attr.stop-color]="palette.light"/>
            <stop offset="0.45" [attr.stop-color]="palette.mid"/>
            <stop offset="0.82" [attr.stop-color]="palette.dark"/>
            <stop offset="1" [attr.stop-color]="palette.deep"/>
          </linearGradient>
          <linearGradient [attr.id]="id('edge')" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" [attr.stop-color]="palette.dark"/>
            <stop offset="1" [attr.stop-color]="palette.deep"/>
          </linearGradient>
          <linearGradient [attr.id]="id('side')" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" [attr.stop-color]="palette.deep"/>
            <stop offset="0.5" [attr.stop-color]="palette.dark"/>
            <stop offset="1" [attr.stop-color]="palette.deep"/>
          </linearGradient>
          <radialGradient [attr.id]="id('light')" cx="50%" cy="50%" r="50%">
            <stop offset="0" [attr.stop-color]="palette.glow" [attr.stop-opacity]="variant === 'hero' ? 0.34 : 0.26"/>
            <stop offset="0.6" [attr.stop-color]="palette.glow" stop-opacity="0.08"/>
            <stop offset="1" [attr.stop-color]="palette.glow" stop-opacity="0"/>
          </radialGradient>
          <linearGradient *ngIf="palette.prism as prism" [attr.id]="id('prism')" x1="0" y1="0" x2="1" y2="0.3">
            <stop *ngFor="let colour of prism; let i = index"
                  [attr.offset]="i / (prism.length - 1)" [attr.stop-color]="colour"/>
          </linearGradient>
        </defs>

        <!-- Stage light and the shadow the stack throws on the floor. -->
        <ellipse [attr.cx]="scene.light.cx" [attr.cy]="scene.light.cy" [attr.rx]="scene.light.rx" [attr.ry]="scene.light.ry"
                 [attr.fill]="'url(#' + id('light') + ')'"/>
        <g class="rays" *ngIf="scene.rays.length > 0" [attr.stroke]="palette.rim" stroke-width="1" stroke-linecap="round" opacity="0.14">
          <line *ngFor="let ray of scene.rays" [attr.x1]="ray.x1" [attr.y1]="ray.y1" [attr.x2]="ray.x2" [attr.y2]="ray.y2"/>
        </g>
        <ellipse [attr.cx]="scene.floor.cx" [attr.cy]="scene.floor.cy" [attr.rx]="scene.floor.rx" [attr.ry]="scene.floor.ry"
                 fill="#000" opacity="0.42"/>

        <!-- Coins, bottom of the stack first. -->
        <g *ngFor="let coin of scene.coins">
          <path [attr.d]="coin.edgePath" [attr.fill]="'url(#' + id('edge') + ')'"/>
          <path [attr.d]="coin.reedPath" fill="none" [attr.stroke]="palette.reed" [attr.stroke-opacity]="palette.prism ? 0.55 : 0.28"
                [attr.stroke-width]="coin.t * 0.55" stroke-dasharray="1.6 2.4"/>
          <ellipse [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.rx]="coin.r" [attr.ry]="coin.ry" [attr.fill]="'url(#' + id('face') + ')'"/>
          <ellipse [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.rx]="coin.r - 2.4" [attr.ry]="coin.ry - 1.1"
                   fill="none" [attr.stroke]="coin.prism ? 'url(#' + id('prism') + ')' : palette.rim"
                   [attr.stroke-width]="coin.prism ? 2.6 : 1.3" [attr.stroke-opacity]="coin.prism ? 1 : 0.7"/>
          <ellipse [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.rx]="coin.r * 0.76" [attr.ry]="coin.ry * 0.76"
                   fill="none" [attr.stroke]="palette.deep" stroke-opacity="0.35" stroke-width="1"/>
          <ng-container *ngIf="coin.mark">
            <g [attr.transform]="coin.shadowTransform" [attr.fill]="palette.markShadow" opacity="0.55">
              <ng-container *ngTemplateOutlet="mark"></ng-container>
            </g>
            <g [attr.transform]="coin.markTransform" [attr.fill]="palette.mark">
              <ng-container *ngTemplateOutlet="mark"></ng-container>
            </g>
          </ng-container>
        </g>

        <!-- The coin that leans against the stack, on the tiers that earn it. -->
        <g *ngIf="scene.standing as coin" class="standing"
           [attr.transform]="'rotate(' + coin.tilt + ' ' + coin.cx + ' ' + coin.cy + ')'">
          <ellipse [attr.cx]="coin.cx - coin.rx * 0.9" [attr.cy]="coin.cy" [attr.rx]="coin.rx" [attr.ry]="coin.ry"
                   [attr.fill]="'url(#' + id('side') + ')'"/>
          <ellipse [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.rx]="coin.rx" [attr.ry]="coin.ry" [attr.fill]="'url(#' + id('face') + ')'"/>
          <ellipse [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.rx]="coin.rx - 1.6" [attr.ry]="coin.ry - 2.4"
                   fill="none" [attr.stroke]="palette.prism ? 'url(#' + id('prism') + ')' : palette.rim"
                   [attr.stroke-width]="palette.prism ? 1.8 : 1.2" stroke-opacity="0.8"/>
          <g [attr.transform]="coin.shadowTransform" [attr.fill]="palette.markShadow" opacity="0.5">
            <ng-container *ngTemplateOutlet="mark"></ng-container>
          </g>
          <g [attr.transform]="coin.markTransform" [attr.fill]="palette.mark">
            <ng-container *ngTemplateOutlet="mark"></ng-container>
          </g>
        </g>

        <g *ngIf="scene.sparks.length > 0" [attr.fill]="palette.rim">
          <circle *ngFor="let spark of scene.sparks" [attr.cx]="spark.x" [attr.cy]="spark.y" [attr.r]="spark.r" opacity="0.7"/>
        </g>
      </svg>
    </ng-template>

    <!-- The struck mark: the wordmark's E, in a 64-unit box. -->
    <ng-template #mark>
      <svg:g transform="translate(5,0) skewX(-8)">
        <svg:rect x="14" y="12" width="10" height="40" rx="3"/>
        <svg:rect x="14" y="12" width="34" height="10" rx="5"/>
        <svg:rect x="14" y="27" width="26" height="10" rx="5"/>
        <svg:rect x="14" y="42" width="34" height="10" rx="5"/>
        <svg:rect x="3" y="12" width="7" height="10" rx="5" opacity="0.45"/>
      </svg:g>
    </ng-template>
  `,
  styles: [`
    :host { display: block; line-height: 0; }
    .art, .raster, .raster picture, .raster img { display: block; inline-size: 100%; block-size: auto; }
    .art { overflow: visible; }
    .raster { position: relative; }
    .stage { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; overflow: visible; }
    .raster picture { position: relative; }
    /* The hero's leaning coin breathes, very slowly. Nothing else moves. */
    .art--hero .standing { animation: tt-coin-lean 7s var(--tt-ease) infinite alternate; transform-box: fill-box; transform-origin: center; }
    @keyframes tt-coin-lean { from { translate: 0 0; } to { translate: 0 -4px; } }
    @media (prefers-reduced-motion: reduce) { .art--hero .standing { animation: none; } }
  `],
})
export class CoinArtComponent implements OnChanges {
  @Input() tier: CoinTier = 'starter';
  @Input() variant: CoinArtVariant = 'card';
  /** Key into the raster registry. Defaults to `coins-<tier>`. */
  @Input() artKey?: string;
  /** Accessible name when the art carries meaning. Empty means decorative. */
  @Input() alt = '';

  private readonly uid = Math.random().toString(36).slice(2, 8);

  scene: Scene = this.compose('starter', 'card');
  raster: ArtSource | undefined;

  get tokens(): Tier {
    return TIERS[this.tier] ?? TIERS.starter;
  }

  get palette() {
    return this.tokens.palette;
  }

  id(part: string): string {
    return `ec-coin-${this.uid}-${part}`;
  }

  ngOnChanges(): void {
    this.scene = this.compose(this.tier, this.variant);
    this.raster = artSource(this.artKey ?? `coins-${this.tier}`, this.variant);
  }

  private geometry(tier: CoinTier, variant: CoinArtVariant): Geometry {
    const stack = STACKS[variant][tier];
    const rich = tier === 'elite' || tier === 'legend';
    switch (variant) {
      case 'tile':
        return { width: 120, height: 100, r: 30, t: 6.5, baseY: 70, stack, standing: false, scatter: 0, rays: 0 };
      case 'hero':
        return { width: 260, height: 220, r: 58, t: 10, baseY: 158, stack, standing: rich, scatter: tier === 'legend' ? 3 : rich ? 2 : 0, rays: 12 };
      case 'quote':
      case 'card':
      default:
        return { width: 200, height: 160, r: 44, t: 8, baseY: 112, stack, standing: rich, scatter: tier === 'legend' ? 2 : 0, rays: 0 };
    }
  }

  private compose(tier: CoinTier, variant: CoinArtVariant): Scene {
    const g = this.geometry(tier, variant);
    const cx = g.width / 2 - (g.standing ? g.r * 0.22 : 0);
    const coins: LyingCoin[] = [];

    // Loose coins first so the stack sits in front of them.
    const scatterR = g.r * 0.3;
    for (let index = 0; index < g.scatter; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const sx = cx + side * (g.r + scatterR * (1.1 + index * 0.35));
      const sy = g.baseY + scatterR * 0.7 - index * 2;
      coins.push(this.lying(sx, sy, scatterR, g.t * 0.45, false, false));
    }

    for (let index = 0; index < g.stack; index += 1) {
      const top = index === g.stack - 1;
      const wobble = index % 2 === 0 ? 0 : (index % 4 === 1 ? 1.5 : -1.5);
      const cy = g.baseY - index * g.t;
      coins.push(this.lying(cx + wobble, cy, g.r, g.t, top, top && tier === 'legend'));
    }

    const standing = g.standing ? this.standingCoin(cx + g.r * 1.08, g.baseY - g.r * 0.62, g.r) : undefined;
    const topY = g.baseY - (g.stack - 1) * g.t;
    const rays: Ray[] = [];
    for (let index = 0; index < g.rays; index += 1) {
      const angle = Math.PI + (index / (g.rays - 1)) * Math.PI;
      const inner = g.r * 1.25;
      const outer = g.r * (2.2 + (index % 2) * 0.5);
      rays.push({
        x1: cx + Math.cos(angle) * inner, y1: topY + Math.sin(angle) * inner * 0.7,
        x2: cx + Math.cos(angle) * outer, y2: topY + Math.sin(angle) * outer * 0.7,
      });
    }

    const sparks = tier === 'legend' && variant !== 'tile'
      ? [
        { x: cx - g.r * 1.15, y: topY - g.r * 0.5, r: 1.6 },
        { x: cx + g.r * 0.9, y: topY - g.r * 0.95, r: 1.2 },
        { x: cx - g.r * 0.4, y: topY - g.r * 1.1, r: 1 },
      ]
      : [];

    // Centre the box on what was drawn, at the same coin scale for every
    // tier: a two-coin Starter is not drawn larger than a seven-coin Legend,
    // it simply sits in the middle of its frame instead of at the bottom.
    const floor = { cx: g.width / 2, cy: g.baseY + g.t + g.r * 0.18, rx: g.r * 1.55, ry: g.r * 0.26 };
    const contentTop = Math.min(
      topY - g.r * 0.4 - (sparks.length ? g.r * 0.75 : 0),
      standing ? standing.cy - standing.ry - 4 : Infinity,
      rays.length ? topY - g.r * 1.9 : Infinity,
    );
    const contentBottom = floor.cy + floor.ry;
    const centre = (contentTop + contentBottom) / 2;
    const viewTop = Math.round(centre - g.height / 2);

    return {
      viewBox: `0 ${viewTop} ${g.width} ${g.height}`,
      width: g.width,
      height: g.height,
      floor,
      light: { cx: g.width / 2, cy: g.baseY - g.r * 0.35, rx: g.width * 0.48, ry: g.height * 0.42 },
      rays,
      coins,
      standing,
      sparks,
    };
  }

  private lying(cx: number, cy: number, r: number, t: number, mark: boolean, prism: boolean): LyingCoin {
    const ry = r * 0.4;
    const scale = (r * 2 * 0.6) / MARK_BOX;
    const half = MARK_BOX / 2;
    return {
      kind: 'lying',
      cx, cy, r, ry, t, mark, prism,
      edgePath: `M ${cx - r} ${cy} A ${r} ${ry} 0 0 0 ${cx + r} ${cy} L ${cx + r} ${cy + t} A ${r} ${ry} 0 0 1 ${cx - r} ${cy + t} Z`,
      reedPath: `M ${cx - r} ${cy + t / 2} A ${r} ${ry} 0 0 0 ${cx + r} ${cy + t / 2}`,
      markTransform: `translate(${cx} ${cy}) scale(${scale} ${scale * 0.4}) translate(${-half} ${-half})`,
      shadowTransform: `translate(${cx} ${cy + 1.4}) scale(${scale} ${scale * 0.4}) translate(${-half} ${-half})`,
    };
  }

  private standingCoin(cx: number, cy: number, r: number): StandingCoin {
    const rx = r * 0.36;
    const ry = r * 0.92;
    const scale = (ry * 2 * 0.56) / MARK_BOX;
    const half = MARK_BOX / 2;
    return {
      kind: 'standing',
      cx, cy, rx, ry, tilt: -14,
      markTransform: `translate(${cx} ${cy}) scale(${scale * 0.4} ${scale}) translate(${-half} ${-half})`,
      shadowTransform: `translate(${cx + 0.9} ${cy + 1.2}) scale(${scale * 0.4} ${scale}) translate(${-half} ${-half})`,
    };
  }
}
