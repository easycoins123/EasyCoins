import {
  IsArray, IsBoolean, IsDefined, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Growth request shapes.
 *
 * As everywhere else in this API, nothing financial arrives in a request. A
 * custom coin quote names an amount or a budget and the server answers with
 * the price; a reveal names a card index and the server answers with what was
 * behind it. `forbidNonWhitelisted` rejects anything else.
 */

export class CustomQuoteDto {
  @IsIn(['amount', 'budget'])
  mode!: 'amount' | 'budget';

  @ValidateIf((dto: CustomQuoteDto) => dto.mode === 'amount')
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount?: number;

  @ValidateIf((dto: CustomQuoteDto) => dto.mode === 'budget')
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  budgetMinor?: number;

  @IsString()
  @MaxLength(100)
  platformId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  regionId?: string;
}

export class RevealEasyDropDto {
  @IsInt()
  @Min(0)
  @Max(9)
  index!: number;
}

export class AttachReferralDto {
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9-]+$/, { message: 'code contains invalid characters' })
  code!: string;
}

export class CreateReviewDto {
  @IsString()
  @MaxLength(100)
  orderId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  body!: string;
}

// --- admin -------------------------------------------------------------------

export class GrowthSettingDto {
  /** The whole value for the key. Validated by `sanitizeGrowthSetting`. */
  @IsDefined()
  value!: unknown;
}

const CAMPAIGN_KINDS = ['WEEKEND_DROP', 'MATCHDAY_DROP', 'PAYDAY_DROP', 'PROMO_DROP', 'COMMUNITY_DROP', 'VIP_DROP'] as const;
const CAMPAIGN_STATUSES = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED'] as const;

/** Loose by design: the service validates every field and names the bad one. */
export class CampaignDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsIn(CAMPAIGN_KINDS)
  kind?: (typeof CAMPAIGN_KINDS)[number];

  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES)
  status?: (typeof CAMPAIGN_STATUSES)[number];

  @IsOptional()
  @IsObject()
  title?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  lede?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  points?: unknown[];

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  endsAt?: string | null;

  @IsOptional()
  @IsObject()
  eligibility?: Record<string, unknown>;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsObject()
  reward?: Record<string, unknown> | null;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsInt()
  @Min(1)
  capTotal?: number | null;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsObject()
  ctaLabel?: Record<string, unknown> | null;

  @IsOptional()
  @ValidateIf((_dto, value) => value !== null)
  @IsString()
  @MaxLength(200)
  ctaLink?: string | null;
}

export class PublishReviewDto {
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
