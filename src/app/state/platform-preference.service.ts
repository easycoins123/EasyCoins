import { Injectable, computed, inject, signal } from '@angular/core';

import { LoggerService } from '../core/logger.service';
import { Platform, PlatformId } from '../domain';

const STORAGE_KEY = 'easycoins.platform.v1';

/**
 * The platform the customer plays on, remembered across pages and visits.
 *
 * Choosing a platform is the first step of buying coins, and it is asked once:
 * the home shelf, the store, the ladder and the product page all read this
 * one value, so a customer who picked Xbox in the hero is shown Xbox offers
 * everywhere and never lands a PlayStation order by accident.
 *
 * Only a platform id is stored. It is validated against the catalog on every
 * read, so a stale or edited value falls back to the first platform offered.
 */
@Injectable({ providedIn: 'root' })
export class PlatformPreferenceService {
  private readonly logger = inject(LoggerService);

  private readonly stored = signal<PlatformId | null>(this.load());

  /** The remembered platform id, or null when the customer has not chosen yet. */
  readonly platformId = this.stored.asReadonly();

  /** True once the customer has made an explicit choice. */
  readonly chosen = computed(() => this.stored() !== null);

  set(platformId: PlatformId): void {
    if (platformId === this.stored()) {
      return;
    }
    this.stored.set(platformId);
    try {
      localStorage.setItem(STORAGE_KEY, platformId);
    } catch {
      this.logger.warn('Could not persist the platform choice');
    }
  }

  /**
   * The platform to price a shelf for: the remembered one when the shelf
   * offers it, otherwise the first the shelf offers.
   */
  resolve(offered: readonly Platform[]): Platform | undefined {
    const wanted = this.stored();
    return offered.find((platform) => platform.id === wanted) ?? offered[0];
  }

  private load(): PlatformId | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw && /^[a-z0-9-]{1,40}$/i.test(raw) ? raw : null;
    } catch {
      return null;
    }
  }
}
