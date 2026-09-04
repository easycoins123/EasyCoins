import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { validationError } from '../../common/errors/api-error';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import {
  GROWTH_CONFIG_KEYS, GROWTH_DEFAULTS, GrowthConfig, GrowthConfigError, GrowthConfigKey, sanitizeGrowthSetting,
} from './growth-config';

/** How long a merged configuration is reused before the rows are re-read. */
const CACHE_TTL_MS = 30_000;

export interface GrowthSettingView {
  readonly key: GrowthConfigKey;
  readonly value: GrowthConfig[GrowthConfigKey];
  readonly source: 'default' | 'override';
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

/**
 * The effective growth configuration: code defaults under database overrides.
 *
 * An override that fails validation is ignored with a warning rather than
 * taking a programme down: a bad row can be repaired from the admin API, and
 * the defaults it falls back to are the conservative ones. The merged result
 * is cached briefly so pricing a cart does not read the table every time.
 */
@Injectable()
export class GrowthConfigService {
  private cache?: { readonly at: number; readonly value: GrowthConfig };

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async get(): Promise<GrowthConfig> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.value;
    }
    const rows = await this.prisma.growthSetting.findMany();
    const merged: Record<string, unknown> = { ...GROWTH_DEFAULTS };

    for (const row of rows) {
      if (!GROWTH_CONFIG_KEYS.includes(row.key as GrowthConfigKey)) {
        continue;
      }
      try {
        merged[row.key] = sanitizeGrowthSetting(row.key as GrowthConfigKey, row.value);
      } catch (error) {
        this.logger.warn('ignoring an invalid growth setting; the default applies', {
          key: row.key,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    const value = merged as unknown as GrowthConfig;
    this.cache = { at: Date.now(), value };
    return value;
  }

  /** Every key with its effective value and where it came from. */
  async list(): Promise<GrowthSettingView[]> {
    const [config, rows] = await Promise.all([this.get(), this.prisma.growthSetting.findMany()]);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return GROWTH_CONFIG_KEYS.map((key) => {
      const row = byKey.get(key);
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
  async set<K extends GrowthConfigKey>(key: K, value: unknown, operator: string): Promise<GrowthConfig[K]> {
    let clean: GrowthConfig[K];
    try {
      clean = sanitizeGrowthSetting(key, value);
    } catch (error) {
      if (error instanceof GrowthConfigError) {
        throw validationError(error.message, [{ field: key, message: { he: error.message, en: error.message } }], 'GROWTH_SETTING_INVALID');
      }
      throw error;
    }
    await this.prisma.growthSetting.upsert({
      where: { key },
      create: { key, value: clean as unknown as Prisma.InputJsonValue, updatedBy: operator },
      update: { value: clean as unknown as Prisma.InputJsonValue, updatedBy: operator },
    });
    await this.prisma.auditLog.create({
      data: {
        eventType: 'growth.setting.updated',
        entityType: 'growth_setting',
        entityId: key,
        actorType: 'OPERATOR',
        actorId: operator,
        afterState: clean as unknown as Prisma.InputJsonValue,
      },
    });
    this.invalidate();
    this.logger.info('growth setting updated', { key, operator });
    return clean;
  }

  /** Removes an override so the code default applies again. */
  async reset(key: GrowthConfigKey, operator: string): Promise<void> {
    await this.prisma.growthSetting.deleteMany({ where: { key } });
    await this.prisma.auditLog.create({
      data: {
        eventType: 'growth.setting.reset',
        entityType: 'growth_setting',
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
