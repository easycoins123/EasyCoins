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
 * Built around the order a buyer reads a card in: what is it, how much do I
 * get, what does it cost, and where do I press. The name is a caption, the
 * quantity is the figure, the price is gold, and the action at the foot is a
 * visible "details" affordance rather than a bare chevron. The whole card is
 * one link, so there is exactly one thing to press.
 *
 * Coin bundles draw their own tier art; other products use their illustration
 * on the same stage, so the shelf reads as one family. Nothing here invents a
 * badge: a saving appears only against a real strike-through price the server
 * sent, and the quantity is read from the product's own variants.
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
    <a class="card" [routerLink]="['/products', product.slug]" [attr.aria-label]="product.name | t">
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
          <p class="amount tt-numeric">{{ range }}</p>
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
          <span class="tt-price tt-numeric">{{ product.fromPrice?.current | money }}</span>
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
      border-radius: var(--tt-radius-lg);
      overflow: hidden;
      color: inherit;
      text-decoration: none;
      transition: transform var(--tt-duration-fast) var(--tt-ease),
                  border-color var(--tt-duration-fast) var(--tt-ease),
                  box-shadow var(--tt-duration) var(--tt-ease);
    }
    .card:hover {
      transform: translateY(-3px);
      border-color: var(--tt-border-strong);
      box-shadow: var(--tt-shadow-2);
      text-decoration: none;
    }

    .media {
      position: relative;
      aspect-ratio: 5 / 4;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        radial-gradient(70% 60% at 50% 62%, var(--tt-brand-tint), transparent 72%),
        var(--tt-bg-elevated);
    }
    .media__art { inline-size: 62%; transition: transform var(--tt-duration-slow) var(--tt-ease-out); }
    .media img {
      inline-size: 54%;
      max-block-size: 78%;
      object-fit: contain;
      filter: drop-shadow(0 12px 18px rgba(0, 0, 0, 0.45));
      transition: transform var(--tt-duration-slow) var(--tt-ease-out);
    }
    .card:hover .media img, .card:hover .media__art { transform: translateY(-3px) scale(1.03); }

    .flag {
      position: absolute;
      inset-block-start: var(--tt-space-2);
      inset-inline-start: var(--tt-space-2);
      padding: 0.15rem 0.45rem;
      border-radius: var(--tt-radius-sm);
      background: var(--tt-gold-500);
      color: var(--tt-text-on-gold);
      font-size: 10px;
      font-weight: 800;
      line-height: 1.6;
      white-space: nowrap;
    }

    .body { display: flex; flex-direction: column; padding: var(--tt-space-3) var(--tt-space-3) var(--tt-space-2); flex: 1; min-block-size: 0; }
    .name { margin: 0; font-size: var(--tt-text-xs); font-weight: 600; color: var(--tt-text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .amount {
      margin: 2px 0 0;
      font-size: var(--tt-text-xl);
      font-weight: 900;
      line-height: 1.05;
      letter-spacing: -0.025em;
      direction: ltr;
      unicode-bidi: isolate;
      text-align: end;
    }
    .amount--words { direction: rtl; font-size: var(--tt-text-md); letter-spacing: normal; line-height: var(--tt-leading-snug); }

    .chips { display: flex; flex-wrap: wrap; gap: 3px; margin-block-start: auto; padding-block-start: var(--tt-space-2); }

    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--tt-space-2);
      padding: var(--tt-space-2) var(--tt-space-3) var(--tt-space-3);
      border-block-start: 1px solid var(--tt-border);
    }
    .foot__price { display: flex; align-items: baseline; gap: 4px; min-inline-size: 0; flex-wrap: wrap; }
    .foot__from { font-size: 10px; color: var(--tt-text-faint); }
    .was { font-size: var(--tt-text-xs); color: var(--tt-text-faint); text-decoration: line-through; }

    /* The action, in the interactive colour. It is part of the link, so it
       says what pressing the card does rather than pretending to be a button
       of its own. */
    .go {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      flex: none;
      min-block-size: 32px;
      padding-inline: var(--tt-space-3) var(--tt-space-2);
      border-radius: var(--tt-radius-md);
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
      .amount { font-size: var(--tt-text-lg); }
      .foot { padding-inline: var(--tt-space-2); }
    }
  `],
})
export class ProductCardComponent {
  @Input({ required: true }) product!: Product;
  @Input() lookups?: CatalogLookups;

  /** Which pack composition to draw, from the product's largest bundle. */
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

  /** The biggest tier this product sells, which drives the artwork. */
  get largestQuantity(): number | undefined {
    const quantities = this.product.variants
      .map((variant) => variant.quantityValue)
      .filter((value): value is number => typeof value === 'number' && value > 0);
    return quantities.length > 0 ? Math.max(...quantities) : undefined;
  }

  /** What a real strike-through saves, or undefined when there is not one. */
  get saved(): Money | undefined {
    return this.product.fromPrice ? savedAmount(this.product.fromPrice) : undefined;
  }

  /** A caption for products with no quantity, so the card still has two lines. */
  get typeLabel(): string {
    switch (this.product.type) {
      case ProductType.PlayerService: return 'שירות';
      case ProductType.GiftCard: return 'כרטיס מתנה';
      case ProductType.Subscription: return 'מנוי';
      case ProductType.DigitalCode: return 'קוד דיגיטלי';
      default: return 'מוצר';
    }
  }

  /** The span of quantities this product sells, as players say them. */
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
