import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { GameEdition, StorefrontState } from '../../domain';
import { StorefrontApiService } from '../api';
import { ApiClient } from './api-client.service';

interface StorefrontDto {
  readonly activeEdition: string;
  readonly editions: readonly {
    readonly id: string;
    readonly label: string;
    readonly productSlug: string;
    readonly productId: string;
    readonly status: string;
  }[];
  readonly launch: {
    readonly id: string;
    readonly live: boolean;
    readonly name: { he: string; en?: string | null };
    readonly percentBps: number;
    readonly capCoins: number;
    readonly minOrderMinor: number;
    readonly eligibility: string;
    readonly startsAt: string | null;
    readonly endsAt: string | null;
    readonly terms: readonly { he: string; en?: string | null }[];
  };
}

const EDITIONS: readonly GameEdition[] = ['fc26', 'fc27'];

function edition(value: string): GameEdition {
  return EDITIONS.includes(value as GameEdition) ? (value as GameEdition) : 'fc26';
}

function localized(value: { he: string; en?: string | null } | null | undefined): { he: string; en?: string } {
  return { he: value?.he ?? '', ...(value?.en ? { en: value.en } : {}) };
}

@Injectable()
export class HttpStorefrontApiService extends StorefrontApiService {
  private readonly api = inject(ApiClient);

  getState(): Observable<StorefrontState> {
    return this.api.get<StorefrontDto>('/storefront').pipe(map((dto): StorefrontState => ({
      activeEdition: edition(dto.activeEdition),
      editions: (dto.editions ?? []).map((entry) => ({
        id: edition(entry.id),
        label: entry.label,
        productSlug: entry.productSlug,
        productId: entry.productId,
        status: entry.status === 'active' || entry.status === 'draft' ? entry.status : 'retired',
      })),
      launch: {
        id: dto.launch.id,
        live: dto.launch.live === true,
        name: localized(dto.launch.name),
        percentBps: Math.max(0, Math.round(dto.launch.percentBps ?? 0)),
        capCoins: Math.max(0, Math.round(dto.launch.capCoins ?? 0)),
        minOrderMinor: Math.max(0, Math.round(dto.launch.minOrderMinor ?? 0)),
        eligibility: 'first-order',
        startsAt: dto.launch.startsAt ?? undefined,
        endsAt: dto.launch.endsAt ?? undefined,
        terms: (dto.launch.terms ?? []).map(localized),
      },
    })));
  }
}
