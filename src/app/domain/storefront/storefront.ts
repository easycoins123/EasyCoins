import { LocalizedText } from '../common';
import { GameEdition } from '../catalog';

/**
 * What the server says the storefront is selling right now.
 *
 * The edition on sale is a fact of the catalog (which coin product has live
 * offers), not a constant in the build: the owner switches FC26 to FC27 from
 * the admin and every hero, shelf, title and order page follows on the next
 * load. The launch offer is described here so the storefront can announce it
 * truthfully; whether it applies to a given order is decided by the server
 * when it prices the cart.
 */
export interface StorefrontEdition {
  readonly id: GameEdition;
  readonly label: string;
  readonly productSlug: string;
  readonly productId: string;
  readonly status: 'active' | 'retired' | 'draft';
}

export interface LaunchOffer {
  readonly id: string;
  /** Switched on and inside its dates. */
  readonly live: boolean;
  readonly name: LocalizedText;
  /** Extra coins as a share of coins bought, basis points (1000 = 10%). */
  readonly percentBps: number;
  readonly capCoins: number;
  readonly minOrderMinor: number;
  readonly eligibility: 'first-order';
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly terms: readonly LocalizedText[];
}

export interface StorefrontState {
  readonly activeEdition: GameEdition;
  readonly editions: readonly StorefrontEdition[];
  readonly launch: LaunchOffer;
}
