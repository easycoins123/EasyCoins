import { LocalizedText } from '../common';
import { Offer } from './product';

/**
 * The coin storefront's own product model.
 *
 * A `CoinProduct` is one purchasable bundle for one game edition on one
 * platform: what the shelf shows and what the cart receives. It is derived
 * from the catalog the API serves (see `core/value/coin-products.ts`), never
 * typed by hand, so prices and stock are always the server's.
 *
 * The edition is data, not design: FC 26 and FC 27 are variants of the same
 * visual system, and adding an edition is a change to `GAME_EDITIONS` only.
 */
export type GameEdition = 'fc26' | 'fc27';

export type CoinPlatform = 'playstation' | 'xbox' | 'pc';

/** EasyCoins' own tiers. Visual tokens live in `ui/components/cards/tiers.ts`. */
export type CoinTier = 'starter' | 'pro' | 'elite' | 'legend';

/**
 * Only badges the data can back. "best-value" is computed from the offers;
 * "popular" and "new" exist in the type so a future data source can set them,
 * but nothing sets them today because nothing measures them.
 */
export type CoinBadge = 'popular' | 'best-value' | 'new';

export interface CoinProduct {
  /** The offer id, which is what the cart needs. */
  readonly id: string;
  readonly game: GameEdition;
  readonly platform: CoinPlatform;
  /** The catalog's name for the exact platform, e.g. "PS5". */
  readonly platformLabel: LocalizedText;
  /** Coins in the bundle. */
  readonly amount: number;
  /** Price in shekels. `offer.price` keeps the exact minor-unit value. */
  readonly priceIls: number;
  readonly compareAtIls?: number;
  /** Shekels per million coins, for the value argument on the card. */
  readonly perMillionIls?: number;
  readonly tier: CoinTier;
  /** Key into the art registry; `coins-<tier>` unless art is supplied per bundle. */
  readonly artKey: string;
  readonly badge?: CoinBadge;
  readonly inStock: boolean;

  readonly productSlug: string;
  readonly variantId: string;
  readonly offer: Offer;
}

export interface GameEditionInfo {
  readonly id: GameEdition;
  readonly year: 26 | 27;
  /** Short label for chips and captions. */
  readonly label: string;
}

export const GAME_EDITIONS: Readonly<Record<GameEdition, GameEditionInfo>> = {
  fc26: { id: 'fc26', year: 26, label: 'FC 26' },
  fc27: { id: 'fc27', year: 27, label: 'FC 27' },
};
