import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { validationError } from '../../common/errors/api-error';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import {
  PRICING_CONFIG_KEYS, PRICING_DEFAULTS, PRICING_SETTING_PREFIX, PricingConfig, PricingConfigError, PricingConfigKey,
  sanitizePricingSetting,
} from './pricing-config';

const CACHE_TTL_MS = 15_000;

export interface PricingSettingView {
  readonly key: PricingConfigKey;
  readonly value: PricingConfig[PricingConfigKey];
  readonly source: 'default' | 'override';
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

/**
 * The effective pricing configuration: code defaults under database overrides.
 *
 * Stored in the same settings table the growth programmes use, under keys
 * prefixed `pricing.`, so one audit log and one admin token cover both. The
 * growth reader ignores these keys and this reader ignores theirs.
 *
 * An override that fails validation is ignored with a warning and the default
 * applies, which for pricing means: the draft ladder and no launch offer.
 * Nothing invalid can price a cart.
 */
@Injectable()
export class PricingConfigService {
  private cache?: { readonly at: number; readonly value: PricingConfig };

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async get(): Promise<PricingConfig> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.value;
    }
    const rows = await this.prisma.growthSetting.findMany({ where: { key: { startsWith: PRICING_SETTING_PREFIX } } });
    const merged: Record<string, unknown> = { ...PRICING_DEFAULTS };
    for (const row of rows) {
      const key = row.key.slice(PRICING_SETTING_PREFIX.length) as PricingConfigKey;
      if (!PRICING_CONFIG_KEYS.includes(key)) {
        continue;
      }
      try {
        merged[key] = sanitizePricingSetting(key, row.value);
      } catch (error) {
        this.logger.warn('ignoring an invalid pricing setting; the default applies', {
          key,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
    const value = merged as unknown as PricingConfig;
    this.cache = { at: Date.now(), value };
    return value;
  }

  async list(): Promise<PricingSettingView[]> {
    const [config, rows] = await Promise.all([
      this.get(),
      this.prisma.growthSetting.findMany({ where: { key: { startsWith: PRICING_SETTING_PREFIX } } }),
    ]);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return PRICING_CONFIG_KEYS.map((key) => {
      const row = byKey.get(PRICING_SETTING_PREFIX + key);
      return {
        key,
        value: config[key],
        source: row ? 'override' : 'default',
        updatedAt: row?.updatedAt.toISOString() ?? null,
        updatedBy: row?.updatedBy ?? null,
      };
    });
  }

  /** Validates and stores an override. The whole key is replaced, never patched. */
  async set<K extends PricingConfigKey>(key: K, value: unknown, operator: string): Promise<PricingConfig[K]> {
    let clean: PricingConfig[K];
    try {
      clean = sanitizePricingSetting(key, value) as PricingConfig[K];
    } catch (error) {
      if (error instanceof PricingConfigError) {
        throw validationError(error.message, [{ field: key, message: { he: error.message, en: error.message } }], 'PRICING_SETTING_INVALID');
      }
      throw error;
    }
    const storageKey = PRICING_SETTING_PREFIX + key;
    await this.prisma.growthSetting.upsert({
      where: { key: storageKey },
      create: { key: storageKey, value: clean as unknown as Prisma.InputJsonValue, updatedBy: operator },
      update: { value: clean as unknown as Prisma.InputJsonValue, updatedBy: operator },
    });
    await this.prisma.auditLog.create({
      data: {
        eventType: 'pricing.setting.updated',
        entityType: 'pricing_setting',
        entityId: key,
        actorType: 'OPERATOR',
        actorId: operator,
        afterState: clean as unknown as Prisma.InputJsonValue,
      },
    });
    this.invalidate();
    this.logger.info('pricing setting updated', { key, operator });
    return clean;
  }

  async reset(key: PricingConfigKey, operator: string): Promise<void> {
    await this.prisma.growthSetting.deleteMany({ where: { key: PRICING_SETTING_PREFIX + key } });
    await this.prisma.auditLog.create({
      data: {
        eventType: 'pricing.setting.reset',
        entityType: 'pricing_setting',
        entityId: key,
        actorType: 'OPERATOR',
        actorId: operator,
      },
    });
    this.invalidate();
  }

  invalidate(): void {
    this.cache = undefined;
  }
}
