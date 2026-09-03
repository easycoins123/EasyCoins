import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CoinTier } from '../../../domain';
import { ArtSource, CoinArtVariant, artSource } from './art-sources';
import { TIERS, Tier, TierPalette } from './tiers';

export type { CoinArtVariant } from './art-sources';

/** A coin lying on the stage, drawn as a top ellipse over a short edge. */
interface LyingCoin {
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

/** A coin standing on its edge, leaning against a stack. */
interface StandingCoin {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly tilt: number;
  readonly markTransform: string;
  readonly shadowTransform: string;
}

/** The coin seen face on: the hero's trophy. */
interface FacingCoin {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly markTransform: string;
  readonly shadowTransform: string;
}

/** The 2M vault: a black case with a gold rim, its lid open, full of coins. */
interface Vault {
  readonly cx: number;
  readonly baseY: number;
  readonly w: number;
  readonly h: number;
  readonly depth: number;
}

interface Ray { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; }

interface Scene {
  readonly viewBox: string;
  readonly width: number;
  readonly height: number;
  readonly floor: { cx: number; cy: number; rx: number; ry: number };
  readonly light: { cx: number; cy: number; rx: number; ry: number };
  readonly rays: readonly Ray[];
  /** Coins drawn behind the vault (their bases inside it). */
  readonly behind: readonly LyingCoin[];
  readonly vault?: Vault;
  readonly coins: readonly LyingCoin[];
  readonly standing?: StandingCoin;
  readonly facing?: FacingCoin;
  readonly sparks: readonly { x: number; y: number; r: number }[];
}

/** The E of the wordmark, as drawn in the brand lockup, in a 64-unit box. */
const MARK_BOX = 64;

/**
 * `?art=vector` on any page draws every composition as SVG even where a
 * raster is registered. The bake script uses it to read the vector it is
 * about to rasterise; it is also the quickest way to compare the two by eye.
 */
const FORCE_VECTOR = typeof window !== 'undefined' && /[?&]art=vector\b/.test(window.location.search);

/** How many coins each tier stacks in the compositions that go by tier. */
const STACKS: Readonly<Record<'tile' | 'card' | 'quote', Readonly<Record<CoinTier, number>>>> = {
  tile: { starter: 1, pro: 2, elite: 3, legend: 4 },
  card: { starter: 2, pro: 3, elite: 4, legend: 5 },
  quote: { starter: 2, pro: 3, elite: 4, legend: 5 },
};

/**
 * Original EasyCoins coin artwork.
 *
 * The EasyCoins coin is one object everywhere: obsidian face, champagne
 * reeded edge, a prismatic rim on the top coin, the brand's E struck in
 * champagne. Value is told by composition, not by colour: a 100K bundle is a
 * couple of coins, 500K a proper stack, 1M a spread of stacks, 2M an open
 * vault spilling over. Tiers colour the chips and borders around the art;
 * the coin itself stays black and gold, the way the brand's coin should.
 *
 * Compositions:
 *   tile    a few coins, for pickers and rails
 *   card    a tier-sized stack, for product cards without an amount
 *   quote   the same, larger, for the quote and the product page
 *   bundle  the composition for an exact bundle size (pass `amount`)
 *   hero    the trophy: a coin face on, stacks behind, a burst of light
 *
 * Everything is inline SVG with the material as gradient stops, so it costs
 * no request. For the compositions shown large, a baked raster of the same
 * drawing is registered in `art-sources.ts` and used instead, AVIF first,
 * WebP as fallback, the vector when neither is registered.
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
    <div *ngIf="raster as art; else drawn" class="raster">
      <svg class="stage" [attr.viewBox]="scene.viewBox" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient [attr.id]="id('stage')" cx="50%" cy="50%" r="50%">
            <stop offset="0" [attr.stop-color]="glow" [attr.stop-opacity]="variant === 'hero' ? 0.34 : 0.24"/>
            <stop offset="0.6" [attr.stop-color]="glow" stop-opacity="0.08"/>
            <stop offset="1" [attr.stop-color]="glow" stop-opacity="0"/>
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
          <linearGradient [attr.id]="id('gold')" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stop-color="#F7EBCB"/>
            <stop offset="0.5" stop-color="#D4B46A"/>
            <stop offset="1" stop-color="#8A6B36"/>
          </linearGradient>
          <linearGradient [attr.id]="id('case')" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stop-color="#2A2620"/>
            <stop offset="0.5" stop-color="#15120E"/>
            <stop offset="1" stop-color="#080706"/>
          </linearGradient>
          <radialGradient [attr.id]="id('light')" cx="50%" cy="50%" r="50%">
            <stop offset="0" [attr.stop-color]="glow" [attr.stop-opacity]="variant === 'hero' ? 0.34 : 0.24"/>
            <stop offset="0.6" [attr.stop-color]="glow" stop-opacity="0.08"/>
            <stop offset="1" [attr.stop-color]="glow" stop-opacity="0"/>
          </radialGradient>
          <linearGradient *ngIf="palette.prism as prism" [attr.id]="id('prism')" x1="0" y1="0" x2="1" y2="0.3">
            <stop *ngFor="let colour of prism; let i = index"
                  [attr.offset]="i / (prism.length - 1)" [attr.stop-color]="colour"/>
          </linearGradient>
        </defs>

        <!-- Stage light and the shadow the objects throw on the floor. -->
        <ellipse [attr.cx]="scene.light.cx" [attr.cy]="scene.light.cy" [attr.rx]="scene.light.rx" [attr.ry]="scene.light.ry"
                 [attr.fill]="'url(#' + id('light') + ')'"/>
        <g class="rays" *ngIf="scene.rays.length > 0" [attr.stroke]="palette.rim" stroke-width="1" stroke-linecap="round" opacity="0.14">
          <line *ngFor="let ray of scene.rays" [attr.x1]="ray.x1" [attr.y1]="ray.y1" [attr.x2]="ray.x2" [attr.y2]="ray.y2"/>
        </g>
        <ellipse [attr.cx]="scene.floor.cx" [attr.cy]="scene.floor.cy" [attr.rx]="scene.floor.rx" [attr.ry]="scene.floor.ry"
                 fill="#000" opacity="0.42"/>

        <!-- The vault's lid, open and behind everything; then the coins inside it;
             then the vault's rim and front; then whatever spilled in front. -->
        <g *ngIf="scene.vault as vault"
           [attr.transform]="'rotate(-26 ' + (vault.cx - vault.w / 2) + ' ' + (vault.baseY - vault.h) + ')'">
          <rect [attr.x]="vault.cx - vault.w / 2" [attr.y]="vault.baseY - vault.h - vault.depth" [attr.width]="vault.w" [attr.height]="vault.depth"
                rx="5" [attr.fill]="'url(#' + id('case') + ')'"/>
          <rect [attr.x]="vault.cx - vault.w / 2 + 4" [attr.y]="vault.baseY - vault.h - vault.depth + 4" [attr.width]="vault.w - 8" [attr.height]="vault.depth - 8"
                rx="3" fill="none" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="1.4" opacity="0.9"/>
          <rect [attr.x]="vault.cx - vault.w / 2 + 4" [attr.y]="vault.baseY - vault.h - vault.depth + 4" [attr.width]="vault.w - 8" [attr.height]="vault.depth - 8"
                rx="3" [attr.fill]="'url(#' + id('gold') + ')'" opacity="0.12"/>
        </g>

        <ng-container *ngFor="let coin of scene.behind">
          <ng-container *ngTemplateOutlet="lying; context: { $implicit: coin }"></ng-container>
        </ng-container>

        <g *ngIf="scene.vault as vault">
          <!-- top rim: a thin gold lip -->
          <path [attr.d]="'M ' + (vault.cx - vault.w / 2) + ' ' + (vault.baseY - vault.h) + ' l ' + (vault.w) + ' 0 l 6 -' + (vault.depth * 0.22) + ' l -' + (vault.w + 12) + ' 0 Z'"
                [attr.fill]="'url(#' + id('gold') + ')'" opacity="0.95"/>
          <!-- front face -->
          <rect [attr.x]="vault.cx - vault.w / 2" [attr.y]="vault.baseY - vault.h" [attr.width]="vault.w" [attr.height]="vault.h"
                rx="5" [attr.fill]="'url(#' + id('case') + ')'"/>
          <rect [attr.x]="vault.cx - vault.w / 2 + 4" [attr.y]="vault.baseY - vault.h + 4" [attr.width]="vault.w - 8" [attr.height]="vault.h - 8"
                rx="4" fill="none" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="1.6" opacity="0.85"/>
          <path [attr.d]="'M ' + (vault.cx - vault.w / 2) + ' ' + (vault.baseY - vault.h * 0.42) + ' h ' + vault.w" [attr.stroke]="'url(#' + id('gold') + ')'" stroke-width="1" opacity="0.5"/>
          <!-- the E plate -->
          <g [attr.transform]="'translate(' + (vault.cx - 9) + ' ' + (vault.baseY - vault.h * 0.34 - 9) + ') scale(0.28)'" [attr.fill]="'url(#' + id('gold') + ')'">
            <g transform="translate(5,0) skewX(-8)">
              <rect x="14" y="12" width="10" height="40" rx="3"/><rect x="14" y="12" width="34" height="10" rx="5"/>
              <rect x="14" y="27" width="26" height="10" rx="5"/><rect x="14" y="42" width="34" height="10" rx="5"/>
            </g>
          </g>
        </g>

        <ng-container *ngFor="let coin of scene.coins">
          <ng-container *ngTemplateOutlet="lying; context: { $implicit: coin }"></ng-container>
        </ng-container>

        <!-- The coin that leans against a stack. -->
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

        <!-- The trophy: the coin face on. -->
        <g *ngIf="scene.facing as coin" class="facing">
          <circle [attr.cx]="coin.cx + 1.5" [attr.cy]="coin.cy + 4" [attr.r]="coin.r" [attr.fill]="'url(#' + id('edge') + ')'"/>
          <circle [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.r]="coin.r" [attr.fill]="'url(#' + id('face') + ')'"/>
          <circle [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.r]="coin.r - 2.2" fill="none" [attr.stroke]="palette.reed"
                  stroke-opacity="0.75" stroke-width="3.2" stroke-dasharray="1.8 2.4"/>
          <circle [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.r]="coin.r - 5.6" fill="none"
                  [attr.stroke]="palette.prism ? 'url(#' + id('prism') + ')' : palette.rim" stroke-width="2.4"/>
          <circle [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.r]="coin.r * 0.72" fill="none" [attr.stroke]="palette.rim" stroke-opacity="0.35" stroke-width="1"/>
          <g [attr.transform]="coin.shadowTransform" [attr.fill]="palette.markShadow" opacity="0.6">
            <ng-container *ngTemplateOutlet="mark"></ng-container>
          </g>
          <g [attr.transform]="coin.markTransform" [attr.fill]="'url(#' + id('gold') + ')'">
            <ng-container *ngTemplateOutlet="mark"></ng-container>
          </g>
        </g>

        <g *ngIf="scene.sparks.length > 0" [attr.fill]="palette.rim">
          <circle *ngFor="let spark of scene.sparks" [attr.cx]="spark.x" [attr.cy]="spark.y" [attr.r]="spark.r" opacity="0.7"/>
        </g>
      </svg>
    </ng-template>

    <!-- One lying coin. -->
    <ng-template #lying let-coin>
      <svg:g>
        <svg:path [attr.d]="coin.edgePath" [attr.fill]="'url(#' + id('edge') + ')'"/>
        <svg:path [attr.d]="coin.reedPath" fill="none" [attr.stroke]="palette.reed" [attr.stroke-opacity]="palette.prism ? 0.55 : 0.28"
                  [attr.stroke-width]="coin.t * 0.55" stroke-dasharray="1.6 2.4"/>
        <svg:ellipse [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.rx]="coin.r" [attr.ry]="coin.ry" [attr.fill]="'url(#' + id('face') + ')'"/>
        <svg:ellipse [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.rx]="coin.r - 2.4" [attr.ry]="coin.ry - 1.1"
                     fill="none" [attr.stroke]="coin.prism ? 'url(#' + id('prism') + ')' : palette.rim"
                     [attr.stroke-width]="coin.prism ? 2.6 : 1.3" [attr.stroke-opacity]="coin.prism ? 1 : 0.7"/>
        <svg:ellipse [attr.cx]="coin.cx" [attr.cy]="coin.cy" [attr.rx]="coin.r * 0.76" [attr.ry]="coin.ry * 0.76"
                     fill="none" [attr.stroke]="palette.deep" stroke-opacity="0.35" stroke-width="1"/>
        <ng-container *ngIf="coin.mark">
          <svg:g [attr.transform]="coin.shadowTransform" [attr.fill]="palette.markShadow" opacity="0.55">
            <ng-container *ngTemplateOutlet="mark"></ng-container>
          </svg:g>
          <svg:g [attr.transform]="coin.markTransform" [attr.fill]="palette.mark">
            <ng-container *ngTemplateOutlet="mark"></ng-container>
          </svg:g>
        </ng-container>
      </svg:g>
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
  `],
})
export class CoinArtComponent implements OnChanges {
  /** Colours the stage light and, for compositions that go by tier, the size. */
  @Input() tier: CoinTier = 'starter';
  @Input() variant: CoinArtVariant = 'card';
  /** The bundle size, for the `bundle` composition. */
  @Input() amount?: number;
  /** Key into the raster registry. Defaults to `coins-<tier>`. */
  @Input() artKey?: string;
  /** Accessible name when the art carries meaning. Empty means decorative. */
  @Input() alt = '';

  private readonly uid = Math.random().toString(36).slice(2, 8);

  scene: Scene = this.compose('starter', 'card', undefined);
  raster: ArtSource | undefined;

  /** The coin is always the EasyCoins coin: black and gold. */
  get palette(): TierPalette {
    return TIERS.legend.palette;
  }

  get tokens(): Tier {
    return TIERS[this.tier] ?? TIERS.starter;
  }

  /** Stage light in the tier's colour, so a shelf still reads as a progression. */
  get glow(): string {
    return this.tokens.palette.glow;
  }

  id(part: string): string {
    return `ec-coin-${this.uid}-${part}`;
  }

  ngOnChanges(): void {
    this.scene = this.compose(this.tier, this.variant, this.amount);
    this.raster = FORCE_VECTOR ? undefined : artSource(this.artKey ?? `coins-${this.tier}`, this.variant);
  }

  private compose(tier: CoinTier, variant: CoinArtVariant, amount: number | undefined): Scene {
    switch (variant) {
      case 'tile': return this.tierStack(tier, 120, 100, 30, 6.5, 70, STACKS.tile[tier], false, 0);
      case 'hero': return this.hero();
      case 'bundle': return this.bundle(amount ?? 0);
      case 'card':
      case 'quote':
      default: {
        const rich = tier === 'elite' || tier === 'legend';
        return this.tierStack(tier, 200, 160, 44, 8, 112, STACKS.card[tier], rich, tier === 'legend' ? 2 : 0);
      }
    }
  }

  /* --- compositions -------------------------------------------------------- */

  private tierStack(tier: CoinTier, width: number, height: number, r: number, t: number, baseY: number,
                    count: number, standing: boolean, scatter: number): Scene {
    const cx = width / 2 - (standing ? r * 0.22 : 0);
    const coins: LyingCoin[] = [];
    this.scatterCoins(coins, cx, baseY, r, t, scatter);
    this.stack(coins, cx, baseY, r, t, count, tier === 'legend');
    const stand = standing ? this.standingCoin(cx + r * 1.08, baseY - r * 0.62, r) : undefined;
    const topY = baseY - (count - 1) * t;
    return this.frame(width, height, r, t, baseY, topY, [], coins, [], undefined, stand, undefined, tier === 'legend' && count > 1);
  }

  /** The bundle compositions: value told by how much metal is on the table. */
  private bundle(amount: number): Scene {
    const width = 200; const height = 160; const t = 7.5;
    const coins: LyingCoin[] = [];
    if (amount >= 2_000_000) {
      // The vault. Coins rise out of it; more spill in front.
      const r = 30; const baseY = 118;
      const vault: Vault = { cx: 100, baseY, w: 118, h: 40, depth: 24 };
      const behind: LyingCoin[] = [];
      this.stack(behind, 78, baseY - 30, r * 0.92, t, 5, false);
      this.stack(behind, 104, baseY - 34, r, t, 7, true);
      this.stack(behind, 130, baseY - 28, r * 0.9, t, 4, false);
      this.scatterCoins(coins, 100, baseY + 10, r * 1.1, t, 3);
      const stand = this.standingCoin(160, baseY - 12, r * 1.05);
      return this.frame(width, height, r, t, baseY, baseY - 34 - 6 * t - 14, behind, coins, [], vault, stand, undefined, true);
    }
    if (amount >= 1_000_000) {
      const r = 34; const baseY = 116;
      this.stack(coins, 58, baseY - 4, r * 0.95, t, 4, false);
      this.stack(coins, 138, baseY - 2, r * 0.95, t, 5, false);
      this.stack(coins, 98, baseY + 6, r, t, 7, true);
      this.scatterCoins(coins, 100, baseY + 16, r * 0.9, t, 3);
      const stand = this.standingCoin(172, baseY - 10, r);
      return this.frame(width, height, r, t, baseY, baseY + 6 - 6 * t, [], coins, [], undefined, stand, undefined, true);
    }
    if (amount >= 500_000) {
      const r = 38; const baseY = 116;
      this.stack(coins, 74, baseY - 6, r * 0.9, t, 3, false);
      this.stack(coins, 108, baseY + 4, r, t, 6, true);
      this.scatterCoins(coins, 100, baseY + 14, r * 0.85, t, 2);
      const stand = this.standingCoin(160, baseY - 8, r);
      return this.frame(width, height, r, t, baseY, baseY + 4 - 5 * t, [], coins, [], undefined, stand, undefined, true);
    }
    if (amount >= 250_000) {
      const r = 40; const baseY = 114;
      this.stack(coins, 100, baseY, r, t, 4, true);
      this.scatterCoins(coins, 100, baseY + 12, r * 0.9, t, 2);
      return this.frame(width, height, r, t, baseY, baseY - 3 * t, [], coins, [], undefined, undefined, undefined, true);
    }
    const r = 42; const baseY = 112;
    this.stack(coins, 100, baseY, r, t, 3, true);
    this.scatterCoins(coins, 100, baseY + 12, r * 0.8, t, 1);
    return this.frame(width, height, r, t, baseY, baseY - 2 * t, [], coins, [], undefined, undefined, undefined, false);
  }

  /** The trophy: the coin face on, in front of stacks, under a burst of light. */
  private hero(): Scene {
    const width = 260; const height = 220; const r = 44; const t = 9; const baseY = 176;
    const coins: LyingCoin[] = [];
    // A pile, not a pair: three stacks of different heights behind the trophy.
    this.stack(coins, 128, baseY - 30, r * 0.8, t, 5, false);
    this.stack(coins, 68, baseY - 8, r * 0.95, t, 7, false);
    this.stack(coins, 198, baseY - 4, r * 0.9, t, 9, false);
    this.scatterCoins(coins, 130, baseY + 12, r * 0.62, t, 4);
    const facing = this.facingCoin(130, baseY - 72, 64);
    const topY = baseY - 70 - 62;
    const rays: Ray[] = [];
    for (let index = 0; index < 12; index += 1) {
      const angle = Math.PI + (index / 11) * Math.PI;
      const inner = 80; const outer = 118 + (index % 2) * 18;
      rays.push({ x1: 130 + Math.cos(angle) * inner, y1: baseY - 70 + Math.sin(angle) * inner * 0.8,
                  x2: 130 + Math.cos(angle) * outer, y2: baseY - 70 + Math.sin(angle) * outer * 0.8 });
    }
    return this.frame(width, height, r, t, baseY, topY, [], coins, rays, undefined, undefined, facing, true);
  }

  /* --- geometry ------------------------------------------------------------ */

  private frame(width: number, height: number, r: number, t: number, baseY: number, topY: number,
                behind: readonly LyingCoin[], coins: readonly LyingCoin[], rays: readonly Ray[],
                vault: Vault | undefined, standing: StandingCoin | undefined, facing: FacingCoin | undefined,
                sparks: boolean): Scene {
    const cx = width / 2;
    const floor = { cx, cy: baseY + t + r * 0.32, rx: r * 2.2, ry: r * 0.3 };
    const contentTop = Math.min(
      topY - r * 0.45 - (sparks ? r * 0.6 : 0),
      standing ? standing.cy - standing.ry - 4 : Infinity,
      facing ? facing.cy - facing.r - 6 : Infinity,
      rays.length ? topY - 30 : Infinity,
    );
    const contentBottom = floor.cy + floor.ry;
    const centre = (contentTop + contentBottom) / 2;
    const viewTop = Math.round(centre - height / 2);
    const sparkList = sparks
      ? [{ x: cx - r * 1.6, y: topY - r * 0.4, r: 1.6 }, { x: cx + r * 1.3, y: topY - r * 0.9, r: 1.2 }, { x: cx - r * 0.3, y: topY - r * 1.1, r: 1 }]
      : [];
    return {
      viewBox: `0 ${viewTop} ${width} ${height}`,
      width, height, floor,
      light: { cx, cy: baseY - r * 0.4, rx: width * 0.48, ry: height * 0.42 },
      rays, behind, vault, coins, standing, facing, sparks: sparkList,
    };
  }

  private stack(into: LyingCoin[], cx: number, baseY: number, r: number, t: number, count: number, prismTop: boolean): void {
    for (let index = 0; index < count; index += 1) {
      const top = index === count - 1;
      const wobble = index % 2 === 0 ? 0 : (index % 4 === 1 ? 1.5 : -1.5);
      into.push(this.lying(cx + wobble, baseY - index * t, r, t, top, top && prismTop));
    }
  }

  private scatterCoins(into: LyingCoin[], cx: number, y: number, r: number, t: number, count: number): void {
    const small = r * 0.42;
    for (let index = 0; index < count; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const sx = cx + side * (r * 1.7 + small * (0.6 + index * 0.9));
      const sy = y - index * 2;
      into.push(this.lying(sx, sy, small, t * 0.5, false, false));
    }
  }

  private lying(cx: number, cy: number, r: number, t: number, mark: boolean, prism: boolean): LyingCoin {
    const ry = r * 0.4;
    const scale = (r * 2 * 0.6) / MARK_BOX;
    const half = MARK_BOX / 2;
    return {
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
      cx, cy, rx, ry, tilt: -14,
      markTransform: `translate(${cx} ${cy}) scale(${scale * 0.4} ${scale}) translate(${-half} ${-half})`,
      shadowTransform: `translate(${cx + 0.9} ${cy + 1.2}) scale(${scale * 0.4} ${scale}) translate(${-half} ${-half})`,
    };
  }

  private facingCoin(cx: number, cy: number, r: number): FacingCoin {
    const scale = (r * 2 * 0.58) / MARK_BOX;
    const half = MARK_BOX / 2;
    return {
      cx, cy, r,
      markTransform: `translate(${cx} ${cy}) scale(${scale}) translate(${-half} ${-half})`,
      shadowTransform: `translate(${cx + 1.2} ${cy + 2}) scale(${scale}) translate(${-half} ${-half})`,
    };
  }
}
