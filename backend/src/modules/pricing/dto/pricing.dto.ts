import { IsBoolean, IsDefined, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/**
 * Pricing request shapes.
 *
 * Settings arrive as a whole value under `value` and are validated by the
 * pricing sanitizers, which know the shape; the DTO only checks that
 * something was sent. Creator codes have flat fields validated here.
 */
export class PricingSettingDto {
  @IsDefined()
  value!: unknown;
}

export class ActivateLadderDto {
  @IsOptional()
  @IsBoolean()
  acknowledgeUnknownCost?: boolean;
}

export class CreatorCodeDto {
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'code must be letters and digits' })
  code!: string;

  @IsString()
  @MaxLength(80)
  creator!: string;

  @IsInt()
  @Min(100)
  @Max(3_000)
  percentBps!: number;

  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSubtotalMinor?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateCreatorCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  creator?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(3_000)
  percentBps?: number;

  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSubtotalMinor?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
