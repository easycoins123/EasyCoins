import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { notFoundError } from '../../common/errors/api-error';
import { PrismaService } from '../../database/prisma.service';
import {
  OfferWithRelations,
  ProductWithRelations,
  isCustomVariant,
  toGameDto,
  toOfferDto,
  toPlatformDto,
  toProductDetailDto,
  toProductDto,
  toRegionDto,
} from './dto/catalog.mapper';

/** Loads everything a product response needs in one round trip, never per row. */
const PRODUCT_INCLUDE = {
  variants: { orderBy: { sortOrder: 'asc' } },
  offers: { where: { active: true }, include: { inventory: true } },
} satisfies Prisma.ProductInclude;

/**
 * The largest page the API will produce, whatever the caller asks for.
 *
 * Without a ceiling, `pageSize=100000` is a denial-of-service request that looks
 * like an ordinary one.
 */
const MAX_PAGE_SIZE = 100;

export interface ProductQuery {
  readonly search?: string;
  readonly gameIds?: string[];
  readonly platformIds?: string[];
  readonly regionIds?: string[];
  readonly types?: string[];
  readonly tags?: string[];
  readonly minPriceMinor?: number;
  readonly maxPriceMinor?: number;
  readonly featuredOnly?: boolean;
  readonly sort?: string;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Catalog reads.
 *
 * Every method here answers with what the database actually holds. A product
 * with no active offer is not purchasable and is not returned, so the storefront
 * cannot advertise something checkout would later refuse to sell.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Games, each with the platforms its offers actually cover.
   *
   * The platform list is a single grouped query rather than one query per game,
   * which is the N+1 this endpoint would otherwise fall into.
   */
  async listGames() {
    const games = await this.prisma.game.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });

    const platformRows = await this.prisma.offer.findMany({
      where: { active: true, product: { active: true } },
      select: { platformId: true, product: { select: { gameId: true } } },
      distinct: ['platformId', 'productId'],
    });

    const byGame = new Map<string, Set<string>>();
    for (const row of platformRows) {
      const set = byGame.get(row.product.gameId) ?? new Set<string>();
      set.add(row.platformId);
      byGame.set(row.product.gameId, set);
    }

    return games.map((game) =>
      toGameDto({ ...game, platformIds: [...(byGame.get(game.id) ?? [])] }),
    );
  }

  /** Indexed on `games.slug`, which is unique. */
  async getGameBySlug(slug: string) {
    const game = await this.prisma.game.findUnique({ where: { slug } });
    if (!game || !game.active) {
      // An inactive game is treated exactly like a missing one: the customer has
      // no business knowing we once sold it.
      throw notFoundError(`Game ${slug} not found or inactive`, 'GAME_NOT_FOUND');
    }

    const platforms = await this.prisma.offer.findMany({
      where: { active: true, product: { gameId: game.id, active: true } },
      select: { platformId: true },
      distinct: ['platformId'],
    });

    return toGameDto({ ...game, platformIds: platforms.map((row) => row.platformId) });
  }

  async listPlatforms() {
    const platforms = await this.prisma.platform.findMany({ orderBy: { sortOrder: 'asc' } });
    return platforms.map(toPlatformDto);
  }

  async listRegions() {
    const regions = await this.prisma.region.findMany({ orderBy: { code: 'asc' } });
    return regions.map(toRegionDto);
  }

  /**
   * The filter values that would actually return something.
   *
   * Built from live offers, so the UI never offers a filter that leads to an
   * empty result.
   */
  async getFacets() {
    const [products, offers, prices] = await Promise.all([
      this.prisma.product.findMany({
        where: { active: true },
        select: { gameId: true, type: true, tags: true },
      }),
      this.prisma.offer.findMany({
        where: { active: true, product: { active: true } },
        select: { platformId: true, regionId: true },
        distinct: ['platformId', 'regionId'],
      }),
      this.prisma.offer.aggregate({
        where: { active: true, product: { active: true } },
        _min: { priceAmountMinor: true },
        _max: { priceAmountMinor: true },
      }),
    ]);

    return {
      gameIds: [...new Set(products.map((product) => product.gameId))],
      platformIds: [...new Set(offers.map((offer) => offer.platformId))],
      regionIds: [...new Set(offers.map((offer) => offer.regionId))],
      types: [...new Set(products.map((product) => product.type))],
      tags: [...new Set(products.flatMap((product) => product.tags))].sort(),
      minPriceMinor: prices._min.priceAmountMinor ?? 0,
      maxPriceMinor: prices._max.priceAmountMinor ?? 0,
    };
  }

  /**
   * Product search.
   *
   * Filters that describe an offer (platform, region, price) are expressed as a
   * `some` condition on the product's active offers, so "PlayStation products"
   * means products with a live PlayStation offer rather than products that once
   * claimed to support it.
   */
  async searchProducts(query: ProductQuery) {
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize));
    const page = Math.max(1, query.page);

    const offerConditions: Prisma.OfferWhereInput = { active: true };
    if (query.platformIds?.length) {
      offerConditions.platformId = { in: query.platformIds };
    }
    if (query.regionIds?.length) {
      offerConditions.regionId = { in: query.regionIds };
    }
    if (query.minPriceMinor !== undefined || query.maxPriceMinor !== undefined) {
      offerConditions.priceAmountMinor = {
        ...(query.minPriceMinor !== undefined ? { gte: query.minPriceMinor } : {}),
        ...(query.maxPriceMinor !== undefined ? { lte: query.maxPriceMinor } : {}),
      };
    }

    const where: Prisma.ProductWhereInput = {
      active: true,
      // A product with no live offer cannot be bought, so it is not a result.
      offers: { some: offerConditions },
      ...(query.gameIds?.length ? { gameId: { in: query.gameIds } } : {}),
      ...(query.types?.length ? { type: { in: query.types as Prisma.EnumProductTypeFilter['in'] } } : {}),
      ...(query.tags?.length ? { tags: { hasSome: query.tags } } : {}),
      ...(query.featuredOnly ? { featured: true } : {}),
      ...(query.search ? this.searchCondition(query.search) : {}),
    };

    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: this.orderFor(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = (products as ProductWithRelations[]).map(toProductDto);

    // Price sorting is applied after mapping, because "from price" is the
    // cheapest live offer rather than a column, and the alternative is a raw
    // query that would duplicate the offer filter above.
    if (query.sort === 'PRICE_ASC' || query.sort === 'PRICE_DESC') {
      const direction = query.sort === 'PRICE_ASC' ? 1 : -1;
      items.sort((a, b) => {
        const left = a.fromPrice?.current.amountMinor ?? Number.MAX_SAFE_INTEGER;
        const right = b.fromPrice?.current.amountMinor ?? Number.MAX_SAFE_INTEGER;
        return (left - right) * direction;
      });
    }

    return { items, page, pageSize, total, hasMore: page * pageSize < total };
  }

  /**
   * Case-insensitive match on the Hebrew name, the English name and the slug.
   *
   * `mode: 'insensitive'` matters here: Hebrew has no case, but the same field
   * holds English names where it does.
   */
  private searchCondition(search: string): Prisma.ProductWhereInput {
    const term = search.trim().slice(0, 100);
    return {
      OR: [
        { slug: { contains: term, mode: 'insensitive' } },
        { name: { path: ['he'], string_contains: term } },
        { name: { path: ['en'], string_contains: term } },
      ],
    };
  }

  private orderFor(sort: string | undefined): Prisma.ProductOrderByWithRelationInput[] {
    switch (sort) {
      case 'NEWEST':
        return [{ createdAt: 'desc' }];
      case 'NAME_ASC':
        return [{ slug: 'asc' }];
      default:
        // Featured first, then a stable tie-break so paging cannot repeat or
        // skip a row between requests.
        return [{ featured: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }];
    }
  }

  /** Indexed on `products.slug`, which is unique. */
  async getProductBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: PRODUCT_INCLUDE,
    });

    if (!product || !product.active) {
      throw notFoundError(`Product ${slug} not found or inactive`, 'PRODUCT_NOT_FOUND');
    }

    return toProductDetailDto(product as ProductWithRelations);
  }

  async getOffersForProduct(productSlug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug: productSlug },
      select: { id: true, active: true },
    });

    if (!product || !product.active) {
      throw notFoundError(`Product ${productSlug} not found or inactive`, 'PRODUCT_NOT_FOUND');
    }

    const offers = await this.prisma.offer.findMany({
      where: { productId: product.id, active: true },
      include: { inventory: true, variant: { select: { metadata: true } } },
      orderBy: { priceAmountMinor: 'asc' },
    });

    // Custom coin offers are real but belong to the customer who quoted them,
    // not on the shelf.
    return (offers as (OfferWithRelations & { variant: { metadata: unknown } })[])
      .filter((offer) => !isCustomVariant(offer.variant.metadata))
      .map(toOfferDto);
  }

  async getOfferById(offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: { inventory: true, product: { select: { active: true } } },
    });

    if (!offer || !offer.active || !offer.product.active) {
      throw notFoundError(`Offer ${offerId} not found or inactive`, 'OFFER_NOT_FOUND');
    }

    return toOfferDto(offer as OfferWithRelations);
  }

  /**
   * Other products for the same game.
   *
   * Related-by-game is a claim we can actually support. Anything stronger would
   * need behavioural data we do not have and would amount to invention.
   */
  async getRelatedProducts(slug: string, limit: number) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true, gameId: true, active: true },
    });

    if (!product || !product.active) {
      throw notFoundError(`Product ${slug} not found or inactive`, 'PRODUCT_NOT_FOUND');
    }

    const related = await this.prisma.product.findMany({
      where: {
        gameId: product.gameId,
        active: true,
        id: { not: product.id },
        offers: { some: { active: true } },
      },
      include: PRODUCT_INCLUDE,
      orderBy: [{ featured: 'desc' }, { id: 'asc' }],
      take: Math.min(24, Math.max(1, limit)),
    });

    return (related as ProductWithRelations[]).map(toProductDto);
  }
}
