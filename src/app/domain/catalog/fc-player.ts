/**
 * FC player data, for the day a feature needs it (player search, a price
 * index, trending items). Nothing consumes this type today and no sync, API
 * subscription or database exists for it; it is declared now so the shape is
 * agreed before a feature arrives, and so the guards have something to guard.
 *
 * DATA ONLY. This type deliberately carries no image, render, portrait,
 * avatar, photo or card-art field. The visual representation of anything in
 * EasyCoins is EasyCoins-owned (see CONTRIBUTING.md, "Asset policy"): a player
 * would be shown as text on an EasyCoins surface, never as a third-party
 * render. `fc-player.spec.ts` fails to compile and
 * `qa/compliance/assets.compliance.test.ts` fails to run if one of the
 * forbidden fields is added.
 */

export type GameYear = 26 | 27;

export interface FcPlayerStats {
  readonly pac: number;
  readonly sho: number;
  readonly pas: number;
  readonly dri: number;
  readonly def: number;
  readonly phy: number;
}

export interface FcPlayer {
  readonly externalId: number;
  readonly eaItemId?: number;
  readonly gameYear: GameYear;

  readonly name: string;
  readonly commonName?: string;
  readonly rating: number;

  readonly position: string;
  readonly altPositions: readonly string[];

  readonly rarityName: string;
  readonly clubName: string;
  readonly leagueName: string;

  readonly nationName: string;
  /** ISO 3166-1 alpha-2, for a `flag-icons` flag if one is ever shown. */
  readonly nationIso2: string;

  readonly stats: FcPlayerStats;

  readonly skillMoves: number;
  readonly weakFoot: number;
  /** ISO 8601 timestamp of the last data sync. */
  readonly syncedAt: string;
}

/**
 * Field names that must never appear on FcPlayer. Checked at compile time in
 * fc-player.spec.ts and at source level by the compliance test.
 */
export const FC_PLAYER_FORBIDDEN_FIELDS = [
  'playerImage', 'cardImage', 'render', 'portrait', 'avatar', 'photo', 'cardArt',
] as const;
