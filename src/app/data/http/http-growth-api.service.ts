import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  ClubSummary, CustomCoinsQuote, CustomCoinsQuoteRequest, CustomCoinsRules, Drop, EasyDrop, FoundersStatus,
  GrowthProgrammes, OrderId, ReferralAttachResult, ReferralSummary, RewardWallet, SubmitReviewRequest,
  SubmitReviewResult, TrustSnapshot,
} from '../../domain';
import { GrowthApiService } from '../api';
import { ApiClient } from './api-client.service';
import * as Dto from './dto';
import { scopedIdempotencyKey } from './idempotency';
import * as Map from './mappers';

@Injectable()
export class HttpGrowthApiService extends GrowthApiService {
  private readonly api = inject(ApiClient);

  getProgrammes(): Observable<GrowthProgrammes> {
    return this.api.get<Dto.ProgrammesDto>('/growth/programmes').pipe(map(Map.toProgrammes));
  }

  getClub(): Observable<ClubSummary> {
    return this.api.get<Dto.ClubSummaryDto>('/account/club').pipe(map(Map.toClubSummary));
  }

  getRewards(): Observable<RewardWallet> {
    return this.api.get<Dto.RewardWalletDto>('/account/rewards').pipe(map(Map.toRewardWallet));
  }

  getEasyDrop(orderId: OrderId): Observable<EasyDrop | undefined> {
    return this.api.get<Dto.EasyDropEnvelopeDto>(`/orders/${encodeURIComponent(orderId)}/easydrop`)
      .pipe(map((dto) => Map.toEasyDrop(dto.drop)));
  }

  revealEasyDrop(orderId: OrderId, index: number): Observable<EasyDrop> {
    // Keyed by order: a double tap opens one card. The server refuses a second
    // pick regardless, so the key is a courtesy to a slow network, not the guard.
    return this.api.post<Dto.EasyDropEnvelopeDto>(
      `/orders/${encodeURIComponent(orderId)}/easydrop/reveal`,
      { index },
      { idempotencyKey: scopedIdempotencyKey('easydrop-reveal', orderId) },
    ).pipe(map((dto) => Map.toEasyDrop(dto.drop)!));
  }

  getReferral(): Observable<ReferralSummary> {
    return this.api.get<Dto.ReferralSummaryDto>('/account/referral').pipe(map(Map.toReferralSummary));
  }

  attachReferral(code: string): Observable<ReferralAttachResult> {
    return this.api.post<Dto.ReferralAttachDto>('/referral/attach', { code }).pipe(map(Map.toReferralAttach));
  }

  getDrops(): Observable<readonly Drop[]> {
    return this.api.get<Dto.DropDto[]>('/growth/campaigns').pipe(map((dtos) => dtos.map(Map.toDrop)));
  }

  getFounders(): Observable<FoundersStatus> {
    return this.api.get<Dto.FoundersDto>('/growth/founders').pipe(map(Map.toFounders));
  }

  getTrust(): Observable<TrustSnapshot> {
    return this.api.get<Dto.TrustSnapshotDto>('/growth/trust').pipe(map(Map.toTrustSnapshot));
  }

  getCustomCoinsRules(): Observable<CustomCoinsRules> {
    return this.api.get<Dto.CustomRulesDto>('/coins/custom/rules').pipe(map(Map.toCustomRules));
  }

  quoteCustomCoins(request: CustomCoinsQuoteRequest): Observable<CustomCoinsQuote> {
    // The request names an amount or a budget and a platform. No price goes up.
    return this.api.post<Dto.CustomQuoteDto>('/coins/custom/quote', {
      mode: request.mode,
      ...(request.mode === 'amount' ? { amount: request.amount } : { budgetMinor: request.budget?.amountMinor }),
      platformId: request.platformId,
      ...(request.regionId ? { regionId: request.regionId } : {}),
    }).pipe(map(Map.toCustomQuote));
  }

  submitReview(request: SubmitReviewRequest): Observable<SubmitReviewResult> {
    return this.api.post<Dto.SubmitReviewResultDto>('/account/reviews', {
      orderId: request.orderId,
      rating: request.rating,
      ...(request.title ? { title: request.title } : {}),
      body: request.body,
    }).pipe(map(Map.toSubmitReviewResult));
  }
}
