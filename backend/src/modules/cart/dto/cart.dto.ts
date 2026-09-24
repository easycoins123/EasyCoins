import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * What a client may say about the cart.
 *
 * Note what is missing: there is no price, no unit price, no subtotal, no
 * discount and no total anywhere in these shapes. With `forbidNonWhitelisted`
 * on, sending one is a validation error rather than a value that gets quietly
 * ignored, so a tampering attempt fails loudly and lands in the logs.
 *
 * An offer id plus a quantity is the entire vocabulary a customer needs.
 */

export class CartLineDto {
  @IsString()
  @MaxLength(100)
  offerId!: string;

  @IsInt({ message: 'quantity must be a whole number' })
  @Min(1, { message: 'quantity must be at least 1' })
  @Max(25, { message: 'quantity may not exceed 25' })
  quantity!: number;
}

export class AddCartItemDto extends CartLineDto {}

export class CartRequestDto {
  @IsArray()
  @ArrayMaxSize(30, { message: 'a cart may not exceed 30 lines' })
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  // Coupon codes are slugs. Constraining the shape here keeps anything
  // exotic away from the lookup below.
  @Matches(/^[a-zA-Z0-9_-]*$/, { message: 'couponCode contains invalid characters' })
  couponCode?: string;

  /**
   * An earned reward the customer wants to use. An id, never a value: what the
   * reward is worth is read from the ledger, and only if the caller owns it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]*$/, { message: 'rewardId contains invalid characters' })
  rewardId?: string;
}

export class ValidateCouponDto {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];

  @IsString()
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9_-]*$/, { message: 'code contains invalid characters' })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]*$/, { message: 'rewardId contains invalid characters' })
  rewardId?: string;
}
