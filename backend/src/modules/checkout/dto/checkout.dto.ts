import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { CartLineDto } from '../../cart/dto/cart.dto';

/**
 * Checkout requests.
 *
 * As with the cart, there is no price, discount or total in any of these
 * shapes. Opening a checkout says what the customer wants to buy; the server
 * decides what that costs.
 */

export class CreateCheckoutSessionDto {
  @IsArray()
  @ArrayMaxSize(30, { message: 'a cart may not exceed 30 lines' })
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  items!: CartLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-zA-Z0-9_-]*$/, { message: 'couponCode contains invalid characters' })
  couponCode?: string;

  /** An earned reward to use on this order. An id; the ledger says what it is worth. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]*$/, { message: 'rewardId contains invalid characters' })
  rewardId?: string;
}

/**
 * Submitted checkout details.
 *
 * Typed as a loose object on purpose. The keys are validated against the
 * session's own requirement snapshot rather than against a fixed DTO, because
 * which fields apply depends on what is being bought. A class with nine optional
 * properties would accept fields the offers never asked for.
 */
export class SubmitCheckoutDetailsDto {
  @IsObject()
  values!: Record<string, unknown>;
}
