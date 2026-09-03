import { FC_PLAYER_FORBIDDEN_FIELDS, FcPlayer } from './fc-player';

type ForbiddenKey = (typeof FC_PLAYER_FORBIDDEN_FIELDS)[number];

/**
 * Resolves to `true` only while FcPlayer has none of the forbidden keys. If
 * someone adds `cardImage` to the type, this becomes `never`, the constant
 * below stops compiling, and the whole unit suite fails to build. That is the
 * point: the policy is enforced by the compiler, not by code review.
 */
type NoImageFields<T> = Extract<keyof T, ForbiddenKey> extends never ? true : never;
const compiled: NoImageFields<FcPlayer> = true;

describe('FcPlayer', () => {
  const sample: FcPlayer = {
    externalId: 1,
    gameYear: 26,
    name: 'Example Player',
    rating: 80,
    position: 'ST',
    altPositions: ['CF'],
    rarityName: 'Rare',
    clubName: 'Example FC',
    leagueName: 'Example League',
    nationName: 'Israel',
    nationIso2: 'IL',
    stats: { pac: 80, sho: 80, pas: 70, dri: 80, def: 40, phy: 70 },
    skillMoves: 4,
    weakFoot: 3,
    syncedAt: '2026-09-03T00:00:00.000Z',
  };

  it('carries data only, never an image or render field', () => {
    expect(compiled).toBe(true);
    for (const field of FC_PLAYER_FORBIDDEN_FIELDS) {
      expect(field in sample).withContext(field).toBe(false);
    }
  });

  it('names the nation by ISO code so a licensed flag set can be used instead of artwork', () => {
    expect(sample.nationIso2).toMatch(/^[A-Z]{2}$/);
  });
});
