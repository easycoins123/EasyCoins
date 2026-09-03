import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { LocalizePipe } from '../../core/i18n';
import { formatQuantity, savedAmount } from '../../core/value';
import { Money, Platform, Product, ProductType, Region } from '../../domain';
import { CatalogLookups } from '../../state/catalog.facade';
import { MoneyPipe } from '../money.pipe';
import { PlatformBadgeComponent, RegionBadgeComponent } from './badges.component';
import { CoinPackComponent } from './coin-pack.component';
import { IconComponent } from './icon.component';

/**
 * A product on the shelf.
 *
 * The name is a caption, the quantity is the figure in the display face, the
 * price is gold, and the action at the foot is a visible "details" affordance.
 * The whole card is one link, so there is exactly one thing to press. Coin
 * bundles draw their own tier art; other products put their illustration on
 * the same stage, so the shelf reads as one family.
 */
@Component({
  selector: 'tt-product-card',
  standalone: true,
  imports: [
    CommonModule, RouterLink, LocalizePipe, MoneyPipe,
    PlatformBadgeComponent, RegionBadgeComponent, CoinPackComponent, IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="card tt-sweep" [routerLink]="['/products', product.slug]" [attr.aria-label]="product.name | t">
      <div class="media">
        <tt-coin-pack *ngIf="largestQuantity as quantity; else artwork"
                      class="media__art" [steps]="packSteps(quantity)"></tt-coin-pack>
        <ng-template #artwork>
          <img *ngIf="product.images[0] as image"
               [src]="image.url" [alt]="image.alt" loading="lazy" decoding="async" />
        </ng-template>
        <span class="flag" *ngIf="saved as amount">חוסכים {{ amount | money }}</span>
      </div>

      <div class="body">
        <ng-container *ngIf="quantityRange as range; else named">
          <p class="name">{{ product.name | t }}</p>
          <p class="amount tt-figure">{{ range }}</p>
        </ng-container>
        <ng-template #named>
          <p class="name">{{ typeLabel }}</p>
          <p class="amount amount--words">{{ product.name | t }}</p>
        </ng-template>

        <div class="chips">
          <tt-platform-badge *ngFor="let platform of platforms | slice:0:3" [platform]="platform"></tt-platform-badge>
          <tt-region-badge *ngFor="let region of regions | slice:0:1" [region]="region"></tt-region-badge>
        </div>
      </div>

      <div class="foot">
        <span class="foot__price">
          <span class="foot__from">החל מ־</span>
          <span class="tt-price">{{ product.fromPrice?.current | money }}</span>
          <span class="was tt-numeric" *ngIf="product.fromPrice?.compareAt as was">{{ was | money }}</span>
        </span>
        <span class="go" aria-hidden="true">
          לפרטים <tt-icon name="chevron" [size]="14" dir="auto"></tt-icon>
        </span>
      </div>
    </a>
  `,
  styles: [`
    :host { display: block; block-size: 100%; }
    .card {
      display: flex;
      flex-direction: column;
      block-size: 100%;
      background: var(--tt-surface);
      border: 1px solid var(--tt-border);
      border-radius: var(--tt-radius-xl);
      overflow: hidden;
      color: inherit;
      text-decoration: none;
      transition: transform var(--tt-duration-fast) var(--tt-ease),
                  border-color var(--tt-duration-fast) var(--tt-ease),
                  box-shadow var(--tt-duration) var(--tt-ease);
    }
    .card:hover { transform: translateY(-4px); border-color: var(--tt-border-brand); box-shadow: var(--tt-ring-brand), 0 22px 50px rgba(0, 0, 0, 0.5); text-decoration: none; }

    .media {
      position: relative;
      aspect-ratio: 5 / 4;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        radial-gradient(70% 60% at 50% 62%, var(--tt-brand-tint), transparent 72%),
        repeating-linear-gradient(99deg, rgba(255, 248, 235, 0.03) 0 1px, transparent 1px 22px),
        var(--tt-bg-elevated);
    }
    .media__art { inline-size: 62%; filter: drop-shadow(0 16px 20px rgba(0, 0, 0, 0.5)); transition: transform var(--tt-duration-slow) var(--tt-ease-out); }
    .media img { inline-size: 54%; max-block-size: 78%; object-fit: contain; filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.45)); transition: transform var(--tt-duration-slow) var(--tt-ease-out); }
    .card:hover .media img, .card:hover .media__art { transform: translateY(-4px) scale(1.04); }

    .flag {
      position: absolute;
      inset-block-start: var(--tt-space-2);
      inset-inline-start: var(--tt-space-2);
      padding: 0.15rem 0.5rem;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 10px;
      font-weight: 800;
      line-height: 1.6;
      white-space: nowrap;
      transform: skewX(-8deg);
    }

    .body { display: flex; flex-direction: column; padding: var(--tt-space-3) var(--tt-space-3) var(--tt-space-2); flex: 1; min-block-size: 0; }
    .name { margin: 0; font-size: var(--tt-text-xs); font-weight: 600; color: var(--tt-text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .amount { margin: 2px 0 0; font-size: 2.1rem; text-align: end; }
    .amount--words { font-family: var(--tt-font); direction: rtl; font-size: var(--tt-text-md); font-weight: 800; letter-spacing: normal; line-height: var(--tt-leading-snug); text-align: start; }
    .chips { display: flex; flex-wrap: wrap; gap: 3px; margin-block-start: auto; padding-block-start: var(--tt-space-2); }

    .foot { display: flex; align-items: center; justify-content: space-between; gap: var(--tt-space-2); padding: var(--tt-space-2) var(--tt-space-3) var(--tt-space-3); border-block-start: 1px solid var(--tt-border); }
    .foot__price { display: flex; align-items: baseline; gap: 4px; min-inline-size: 0; flex-wrap: wrap; }
    .foot__from { font-size: 10px; color: var(--tt-text-faint); }
    .foot__price .tt-price { font-size: 1.5rem; }
    .was { font-size: var(--tt-text-xs); color: var(--tt-text-faint); text-decoration: line-through; }
    .go {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      flex: none;
      min-block-size: 34px;
      padding-inline: var(--tt-space-3) var(--tt-space-2);
      border-radius: var(--tt-radius-pill);
      background: var(--tt-brand-tint);
      color: var(--tt-brand-300);
      font-size: var(--tt-text-sm);
      font-weight: 700;
      transition: background-color var(--tt-duration-fast) var(--tt-ease), color var(--tt-duration-fast) var(--tt-ease);
    }
    .card:hover .go { background: var(--tt-brand-500); color: var(--tt-text-on-brand); }

    @media (max-width: 400px) {
      .chips { display: none; }
      .body { padding: var(--tt-space-2) var(--tt-space-2) var(--tt-space-1); }
      .amount { font-size: 1.8rem; }
      .foot { padding-inline: var(--tt-space-2); }
    }
  `],
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  @Input() lookups?: CatalogLookups;

  packSteps(quantity: number): number {
    if (quantity <= 250_000) {
      return 1;
    }
    if (quantity <= 500_000) {
      return 2;
    }
    if (quantity <= 1_000_000) {
      return 3;
    }
    return quantity <= 2_000_000 ? 4 : 5;
  }

  get largestQuantity(): number | undefined {
    const quantities = this.product.variants
      .map((variant) => variant.quantityValue)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    return quantities.length > 0 ? Math.max(...quantities) : undefined;
  }

  get saved(): Money | undefined {
    return this.product.fromPrice ? savedAmount(this.product.fromPrice) : undefined;
  }

  get typeLabel(): string {
    switch (this.product.type) {
      case ProductType.PlayerService: return 'שירות';
      case ProductType.GiftCard: return 'כרטיס מתנה';
      case ProductType.Subscription: return 'מנוי';
      case ProductType.DigitalCode: return 'קוד דיגיטלי';
      default: return 'מוצר';
    }
  }

  get quantityRange(): string | undefined {
    const quantities = this.product.variants
      .map((variant) => variant.quantityValue)
      .filter((value): value is number => typeof value === 'number' && value > 0)
      .sort((a, b) => a - b);
    if (quantities.length === 0) {
      return undefined;
    }
    const smallest = formatQuantity(quantities[0]);
    const largest = formatQuantity(quantities[quantities.length - 1]);
    return smallest === largest ? smallest : `${smallest}–${largest}`;
  }

  get platforms(): readonly Platform[] {
    return this.resolve(this.product.platformIds, this.lookups?.platforms);
  }

  get regions(): readonly Region[] {
    return this.resolve(this.product.regionIds, this.lookups?.regions);
  }

  private resolve<T>(ids: readonly string[], source: ReadonlyMap<string, T> | undefined): readonly T[] {
    if (!source) {
      return [];
    }
    return ids.map((id) => source.get(id)).filter((value): value is T => value !== undefined);
  }
}
