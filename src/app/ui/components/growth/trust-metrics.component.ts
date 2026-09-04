import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { formatQuantity } from '../../../core/value';
import { TrustMetric, TrustSnapshot } from '../../../domain';
import { IconComponent, IconName } from '../icon.component';

/**
 * Operational figures the shop has actually earned.
 *
 * Renders only metrics the server published, which it does only past a
 * threshold the owner set. With nothing published the component renders
 * nothing at all, so a young shop shows no numbers rather than small ones.
 */
@Component({
  selector: 'tt-trust-metrics',
  standalone: true,
  imports: [CommonModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="metrics" *ngIf="published.length > 0">
      <li class="metric" *ngFor="let metric of published">
        <span class="metric__glyph" aria-hidden="true"><tt-icon [name]="iconOf(metric)" [size]="18"></tt-icon></span>
        <span class="metric__value tt-figure">{{ valueOf(metric) }}</span>
        <span class="metric__label">{{ metric.label.he }}</span>
      </li>
    </ul>
  `,
  styles: [`
    :host { display: block; margin-block-end: var(--tt-space-4); }
    :host(.empty) { display: none; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--tt-space-3); margin: 0; padding: 0; list-style: none; }
    .metric { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: var(--tt-space-3); border: 1px solid var(--tt-border); border-radius: var(--tt-radius-md); background: var(--tt-surface); text-align: center; }
    .metric__glyph { color: var(--tt-gold-400); }
    .metric__value { font-size: 1.8rem; color: var(--tt-gold-400); }
    .metric__label { font-size: var(--tt-caption); color: var(--tt-text-muted); }
  `],
})
export class TrustMetricsComponent {
  published: readonly TrustMetric[] = [];

  @Input() set snapshot(value: TrustSnapshot | null | undefined) {
    this.published = value?.enabled ? value.metrics.filter((metric) => metric.published && metric.value !== undefined) : [];
  }

  @HostBinding('class.empty') get empty(): boolean {
    return this.published.length === 0;
  }

  valueOf(metric: TrustMetric): string {
    const value = metric.value ?? 0;
    switch (metric.unit) {
      case 'coins':
        return formatQuantity(value);
      case 'minutes':
        return value >= 60 ? `${Math.round(value / 60)} שע׳` : `${value} דק׳`;
      default:
        return value.toLocaleString('he-IL');
    }
  }

  iconOf(metric: TrustMetric): IconName {
    switch (metric.key) {
      case 'coinsDelivered':
        return 'coins';
      case 'medianFulfillmentMinutes':
        return 'clock';
      case 'repeatCustomers':
        return 'user';
      case 'verifiedReviews':
        return 'star';
      default:
        return 'package';
    }
  }
}
