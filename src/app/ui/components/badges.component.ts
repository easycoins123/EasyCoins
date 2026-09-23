import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { LocalizePipe } from '../../core/i18n';
import { FulfillmentDescriptor, InventoryStatus, LocalizedText, Platform, Region, localized } from '../../domain';

/**
 * Domain badges.
 *
 * Each one renders a domain record it is given — never a hard-coded string. A new
 * platform or region appears in the UI as soon as it exists in the data.
 */

@Component({
  selector: 'tt-platform-badge',
  standalone: true,
  imports: [CommonModule, LocalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="tt-badge" *ngIf="platform">{{ platform.shortName | t }}</span>
  `,
})
export class PlatformBadgeComponent {
  @Input() platform?: Platform;
}

/**
 * Region is shown wherever a region-locked product is shown. A customer must be
 * able to see, before paying, which store region a code belongs to.
 */
@Component({
  selector: 'tt-region-badge',
  standalone: true,
  imports: [CommonModule, LocalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="tt-badge"
          *ngIf="region"
          [class.tt-badge--warning]="!region.isRegionFree"
          [class.tt-badge--info]="region.isRegionFree"
          [attr.title]="region.restrictionNotice ? (region.restrictionNotice | t) : null">
      <ng-container *ngIf="region.isRegionFree; else locked">ללא נעילת אזור</ng-container>
      <ng-template #locked>אזור חנות: {{ region.name | t }}</ng-template>
    </span>
  `,
})
export class RegionBadgeComponent {
  @Input() region?: Region;
}

@Component({
  selector: 'tt-fulfillment-badge',
  standalone: true,
  imports: [CommonModule, LocalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="tt-badge" *ngIf="descriptor"
          [class.tt-badge--success]="descriptor.automated"
          [class.tt-badge--accent]="!descriptor.automated">
      {{ descriptor.label | t }}<ng-container *ngIf="eta"> · {{ eta | t }}</ng-container>
    </span>
  `,
})
export class FulfillmentBadgeComponent {
  @Input() descriptor?: FulfillmentDescriptor;

  /** Renders the honest window; nothing is shown when no ETA was published. */
  get eta(): LocalizedText | null {
    const min = this.descriptor?.etaMinutesMin;
    const max = this.descriptor?.etaMinutesMax;
    if (max === undefined) {
      return null;
    }
    if (max <= 5) {
      return localized('עד 5 דקות', 'within 5 minutes');
    }
    return min === undefined
      ? localized(`עד ${max} דקות`, `within ${max} minutes`)
      : localized(`${min}–${max} דקות`, `${min}–${max} minutes`);
  }
}

@Component({
  selector: 'tt-stock-badge',
  standalone: true,
  imports: [CommonModule, LocalizePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="tt-badge"
          [class.tt-badge--success]="status === 'IN_STOCK'"
          [class.tt-badge--warning]="status === 'LOW_STOCK' || status === 'PRE_ORDER'"
          [class.tt-badge--danger]="status === 'OUT_OF_STOCK' || status === 'DISCONTINUED'">
      {{ label | t }}
    </span>
  `,
})
export class StockBadgeComponent {
  @Input() status: InventoryStatus = InventoryStatus.InStock;
  @Input() remaining?: number;

  get label(): LocalizedText {
    switch (this.status) {
      case InventoryStatus.InStock:
        return localized('במלאי', 'In stock');
      case InventoryStatus.LowStock:
        return this.remaining === undefined
          ? localized('מלאי מוגבל', 'Limited stock')
          : localized(`נותרו ${this.remaining}`, `${this.remaining} left`);
      case InventoryStatus.PreOrder:
        return localized('בהזמנה מוקדמת', 'Pre-order');
      case InventoryStatus.OutOfStock:
        return localized('אזל מהמלאי', 'Out of stock');
      case InventoryStatus.Discontinued:
      default:
        return localized('לא זמין', 'Unavailable');
    }
  }
}
