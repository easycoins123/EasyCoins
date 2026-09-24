import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

import { STOREFRONT } from '../core/brand';
import { GAME_EDITIONS, GameEdition, LaunchOffer, StorefrontState } from '../domain';
import { StorefrontApiService } from '../data/api';

/**
 * The edition on sale and the launch offer, for every page that names them.
 *
 * Read once per session and shared. When the server cannot be reached the
 * facade answers with the build's own constants (the edition the storefront
 * shipped with and no launch offer), so the shop still renders, with no
 * claim it cannot back.
 */
@Injectable({ providedIn: 'root' })
export class StorefrontFacade {
  private readonly api = inject(StorefrontApiService);

  /** The build's own answer, used until the server has spoken and if it never does. */
  static readonly FALLBACK: StorefrontState = {
    activeEdition: STOREFRONT.focusGameEdition,
    editions: [
      { id: 'fc26', label: GAME_EDITIONS.fc26.label, productSlug: STOREFRONT.focusProductSlug, productId: 'prod-fc-coins', status: 'active' },
    ],
    launch: {
      id: 'none', live: false, name: { he: '' }, percentBps: 0, capCoins: 0, minOrderMinor: 0, eligibility: 'first-order', terms: [],
    },
  };

  readonly state$: Observable<StorefrontState> = this.api.getState().pipe(
    catchError(() => of(StorefrontFacade.FALLBACK)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly edition$: Observable<GameEdition> = this.state$.pipe(map((state) => state.activeEdition));

  /** The coin product the shop leads with: the active edition's. */
  readonly focusProductSlug$: Observable<string> = this.state$.pipe(map((state) => focusSlug(state)));

  readonly launch$: Observable<LaunchOffer> = this.state$.pipe(map((state) => state.launch));

  /** The same facts as signals, for templates that already run on signals. */
  readonly state = toSignal(this.state$, { initialValue: StorefrontFacade.FALLBACK });

  /** "FC 27", for kickers and cards. */
  editionLabel(edition: GameEdition): string {
    return GAME_EDITIONS[edition]?.label ?? GAME_EDITIONS[STOREFRONT.focusGameEdition].label;
  }
}

/** The active edition's product slug, or the build's when the server lists none. */
export function focusSlug(state: StorefrontState): string {
  return state.editions.find((edition) => edition.id === state.activeEdition && edition.status === 'active')?.productSlug
    ?? state.editions.find((edition) => edition.status === 'active')?.productSlug
    ?? STOREFRONT.focusProductSlug;
}
