import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Campaign, CampaignKind, CampaignStatus, Order } from '@prisma/client';

import { notFoundError, validationError } from '../../common/errors/api-error';
import { generateId } from '../../common/crypto/tokens';
import { AppLogger } from '../../common/logging/app-logger.service';
import { PrismaService } from '../../database/prisma.service';
import { GrowthConfigError, LocalizedText, RewardTemplate, sanitizeRewardTemplate } from './growth-config';
import { QUALIFYING_ORDER_STATUSES, isQualifying, isUniqueViolation, localizedOf, ownerOf } from './growth-shared';
import { RewardsService } from './rewards.service';

type Db = Prisma.TransactionClient | PrismaService;

export type EffectiveCampaignStatus = 'draft' | 'scheduled' | 'active' | 'ended';

export interface CampaignEligibility {
  readonly minOrderMinor?: number;
  readonly firstOrderOnly?: boolean;
}

export interface CampaignView {
  readonly id: string;
  readonly slug: string;
  readonly kind: CampaignKind;
  readonly status: EffectiveCampaignStatus;
  readonly title: LocalizedText;
  readonly lede: LocalizedText;
  readonly points: readonly LocalizedText[];
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly reward: { readonly title: LocalizedText; readonly kind: RewardTemplate['kind']; readonly value: number } | null;
  readonly eligibility: CampaignEligibility;
  readonly cta: { readonly label: LocalizedText; readonly link: string } | null;
  /** Claims left under the cap; null when the campaign has no cap. */
  readonly remaining: number | null;
}

export interface CampaignInput {
  readonly slug?: string;
  readonly kind?: CampaignKind;
  readonly status?: CampaignStatus;
  readonly title?: unknown;
  readonly lede?: unknown;
  readonly points?: unknown;
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
  readonly eligibility?: unknown;
  readonly reward?: unknown;
  readonly capTotal?: number | null;
  readonly ctaLabel?: unknown;
  readonly ctaLink?: string | null;
}

const KINDS: readonly CampaignKind[] = ['WEEKEND_DROP', 'MATCHDAY_DROP', 'PAYDAY_DROP', 'PROMO_DROP', 'COMMUNITY_DROP', 'VIP_DROP'];
const STATUSES: readonly CampaignStatus[] = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED'];

/** A validated value on its way into a JSON column. */
const json = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/**
 * The Drop Zone.
 *
 * A campaign is a row with real state and, optionally, real dates. The
 * storefront shows what is active and what is scheduled with a date; a draft
 * is invisible, an ended one is gone, and there is no countdown without an
 * `endsAt`. When nothing is active the storefront says the next drop is being
 * prepared, which is the truth, rather than showing an empty section.
 *
 * A campaign with a reward hands it to a paid order that meets its
 * eligibility, once per customer and within its cap. The cap is a conditional
 * increment, so a hundred simultaneous orders cannot overshoot it.
 */
@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rewards: RewardsService,
    private readonly logger: AppLogger,
  ) {}

  /** The state a customer should be told, from the row and the clock. */
  effectiveStatus(campaign: Pick<Campaign, 'status' | 'startsAt' | 'endsAt'>, now = new Date()): EffectiveCampaignStatus {
    if (campaign.status === 'DRAFT') {
      return 'draft';
    }
    if (campaign.status === 'ENDED' || (campaign.endsAt !== null && campaign.endsAt <= now)) {
      return 'ended';
    }
    if (campaign.startsAt !== null && campaign.startsAt > now) {
      return 'scheduled';
    }
    return campaign.status === 'SCHEDULED' && campaign.startsAt === null ? 'scheduled' : 'active';
  }

  /** What the storefront may show: live drops and dated upcoming ones. */
  async publicList(now = new Date()): Promise<CampaignView[]> {
    const rows = await this.prisma.campaign.findMany({
      where: { status: { in: ['SCHEDULED', 'ACTIVE'] } },
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
      take: 20,
    });
    return rows
      .map((row) => this.view(row, now))
      .filter((view) => view.status === 'active' || (view.status === 'scheduled' && view.startsAt !== null));
  }

  async adminList(): Promise<(CampaignView & { readonly storedStatus: CampaignStatus; readonly claimedCount: number; readonly capTotal: number | null })[]> {
    const rows = await this.prisma.campaign.findMany({ orderBy: [{ createdAt: 'desc' }] });
    return rows.map((row) => ({ ...this.view(row), storedStatus: row.status, claimedCount: row.claimedCount, capTotal: row.capTotal }));
  }

  async create(input: CampaignInput, operator: string): Promise<CampaignView> {
    const data = this.sanitize(input);
    if (!data.slug || !data.kind || !data.title || !data.lede) {
      throw validationError('slug, kind, title and lede are required', [], 'CAMPAIGN_INVALID');
    }
    const row = await this.prisma.campaign.create({
      data: {
        id: generateId('camp'),
        slug: data.slug,
        kind: data.kind,
        status: data.status ?? 'DRAFT',
        title: json(data.title),
        lede: json(data.lede),
        points: json(data.points ?? []),
        startsAt: data.startsAt ?? null,
        endsAt: data.endsAt ?? null,
        eligibility: json(data.eligibility ?? {}),
        reward: data.reward ? json(data.reward) : undefined,
        capTotal: data.capTotal ?? null,
        ctaLabel: data.ctaLabel ? json(data.ctaLabel) : undefined,
        ctaLink: data.ctaLink ?? null,
      },
    });
    await this.audit('growth.campaign.created', row.id, operator, row);
    return this.view(row);
  }

  async update(id: string, input: CampaignInput, operator: string): Promise<CampaignView> {
    const existing = await this.prisma.campaign.findUnique({ where: { id } });
    if (!existing) {
      throw notFoundError(`Campaign ${id} not found`, 'CAMPAIGN_NOT_FOUND');
    }
    const data = this.sanitize(input);
    const patch: Prisma.CampaignUpdateInput = {};
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.kind !== undefined) patch.kind = data.kind;
    if (data.status !== undefined) patch.status = data.status;
    if (data.title !== undefined) patch.title = json(data.title);
    if (data.lede !== undefined) patch.lede = json(data.lede);
    if (data.points !== undefined) patch.points = json(data.points);
    if (input.startsAt !== undefined) patch.startsAt = data.startsAt ?? null;
    if (input.endsAt !== undefined) patch.endsAt = data.endsAt ?? null;
    if (data.eligibility !== undefined) patch.eligibility = json(data.eligibility);
    if (input.reward !== undefined) patch.reward = data.reward === null || data.reward === undefined ? Prisma.DbNull : json(data.reward);
    if (input.capTotal !== undefined) patch.capTotal = data.capTotal ?? null;
    if (input.ctaLabel !== undefined) patch.ctaLabel = data.ctaLabel === null || data.ctaLabel === undefined ? Prisma.DbNull : json(data.ctaLabel);
    if (input.ctaLink !== undefined) patch.ctaLink = data.ctaLink ?? null;

    const row = await this.prisma.campaign.update({ where: { id }, data: patch });
    await this.audit('growth.campaign.updated', row.id, operator, row);
    return this.view(row);
  }

  /**
   * Hands a paid order the reward of the first active campaign it qualifies
   * for. One campaign reward per order, one claim per customer per campaign.
   */
  async applyOnPaid(db: Db, order: Pick<Order, 'id' | 'customerId' | 'sessionId' | 'totalMinor' | 'status'>): Promise<void> {
    if (!isQualifying(order.status)) {
      return;
    }
    const now = new Date();
    const candidates = (await db.campaign.findMany({ where: { status: { in: ['SCHEDULED', 'ACTIVE'] } } }))
      .filter((campaign) => this.effectiveStatus(campaign, now) === 'active' && campaign.reward !== null);
    const owner = ownerOf(order);

    for (const campaign of candidates) {
      const eligibility = (campaign.eligibility ?? {}) as CampaignEligibility;
      if (eligibility.minOrderMinor !== undefined && order.totalMinor < eligibility.minOrderMinor) {
        continue;
      }
      if (eligibility.firstOrderOnly) {
        const prior = await db.order.count({
          where: {
            id: { not: order.id },
            status: { in: [...QUALIFYING_ORDER_STATUSES] },
            ...(owner.customerId ? { customerId: owner.customerId } : { sessionId: owner.sessionId }),
          },
        });
        if (prior > 0) {
          continue;
        }
      }
      const already = await db.campaignClaim.findFirst({
        where: {
          campaignId: campaign.id,
          OR: [
            ...(owner.customerId ? [{ customerId: owner.customerId }] : []),
            ...(owner.sessionId ? [{ sessionId: owner.sessionId }] : []),
          ],
        },
      });
      if (already) {
        continue;
      }

      // The cap: claimed only if a place is left, in one statement.
      const counted = await db.campaign.updateMany({
        where: { id: campaign.id, OR: [{ capTotal: null }, { claimedCount: { lt: campaign.capTotal ?? 0 } }] },
        data: { claimedCount: { increment: 1 } },
      });
      if (counted.count !== 1) {
        continue;
      }

      let template: RewardTemplate;
      try {
        template = sanitizeRewardTemplate(campaign.reward, 'campaign.reward');
      } catch (error) {
        this.logger.warn('campaign has an invalid reward; nothing issued', { campaignId: campaign.id, reason: error instanceof Error ? error.message : 'unknown' });
        await db.campaign.updateMany({ where: { id: campaign.id }, data: { claimedCount: { decrement: 1 } } });
        continue;
      }

      try {
        const reward = await this.rewards.issue(db, {
          owner,
          source: 'CAMPAIGN',
          sourceOrderId: order.id,
          template,
          defaultExpiresInDays: 30,
          metadata: { campaignId: campaign.id, slug: campaign.slug },
        });
        await db.campaignClaim.create({
          data: {
            id: generateId('clm'),
            campaignId: campaign.id,
            customerId: owner.customerId,
            sessionId: owner.customerId ? null : owner.sessionId,
            orderId: order.id,
            rewardId: reward?.id ?? null,
          },
        });
        this.logger.info('campaign reward claimed', { campaignId: campaign.id, orderId: order.id });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
      }
      return;
    }
  }

  private view(row: Campaign, now = new Date()): CampaignView {
    let reward: CampaignView['reward'] = null;
    if (row.reward) {
      try {
        const template = sanitizeRewardTemplate(row.reward, 'reward');
        reward = { title: template.title, kind: template.kind, value: template.value };
      } catch {
        reward = null;
      }
    }
    const cta = row.ctaLink ? { label: localizedOf(row.ctaLabel, 'לפרטים'), link: row.ctaLink } : null;
    return {
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      status: this.effectiveStatus(row, now),
      title: localizedOf(row.title),
      lede: localizedOf(row.lede),
      points: Array.isArray(row.points) ? row.points.map((point) => localizedOf(point)) : [],
      startsAt: row.startsAt?.toISOString() ?? null,
      endsAt: row.endsAt?.toISOString() ?? null,
      reward,
      eligibility: (row.eligibility ?? {}) as CampaignEligibility,
      cta,
      remaining: row.capTotal === null ? null : Math.max(0, row.capTotal - row.claimedCount),
    };
  }

  private sanitize(input: CampaignInput) {
    const problems: { field: string; message: { he: string; en: string } }[] = [];
    const problem = (field: string, message: string) => problems.push({ field, message: { he: message, en: message } });

    const slug = input.slug === undefined ? undefined : String(input.slug).trim().toLowerCase();
    if (slug !== undefined && !/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) {
      problem('slug', 'slug must be 2-61 lowercase letters, digits or dashes');
    }
    const kind = input.kind === undefined ? undefined : input.kind;
    if (kind !== undefined && !KINDS.includes(kind)) {
      problem('kind', `kind must be one of ${KINDS.join(', ')}`);
    }
    const status = input.status === undefined ? undefined : input.status;
    if (status !== undefined && !STATUSES.includes(status)) {
      problem('status', `status must be one of ${STATUSES.join(', ')}`);
    }
    const text = (value: unknown, field: string): LocalizedText | undefined => {
      if (value === undefined) {
        return undefined;
      }
      const record = value as Record<string, unknown> | null;
      if (!record || typeof record['he'] !== 'string' || record['he'].trim().length < 2) {
        problem(field, `${field} needs a Hebrew text`);
        return undefined;
      }
      return { he: record['he'].trim().slice(0, 200), en: typeof record['en'] === 'string' ? record['en'].trim().slice(0, 200) : record['he'].trim().slice(0, 200) };
    };
    const date = (value: string | null | undefined, field: string): Date | null | undefined => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null || value === '') {
        return null;
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        problem(field, `${field} must be an ISO date`);
        return undefined;
      }
      return parsed;
    };

    const title = text(input.title, 'title');
    const lede = text(input.lede, 'lede');
    const points = input.points === undefined
      ? undefined
      : Array.isArray(input.points) && input.points.length <= 6
        ? input.points.map((point, index) => text(point, `points[${index}]`)).filter((point): point is LocalizedText => point !== undefined)
        : (problem('points', 'points must be a list of at most 6 texts'), undefined);
    const startsAt = date(input.startsAt, 'startsAt');
    const endsAt = date(input.endsAt, 'endsAt');
    if (startsAt && endsAt && endsAt <= startsAt) {
      problem('endsAt', 'endsAt must be after startsAt');
    }

    let eligibility: CampaignEligibility | undefined;
    if (input.eligibility !== undefined) {
      const record = (input.eligibility ?? {}) as Record<string, unknown>;
      eligibility = {};
      if (record['minOrderMinor'] !== undefined) {
        if (typeof record['minOrderMinor'] !== 'number' || record['minOrderMinor'] < 0) {
          problem('eligibility.minOrderMinor', 'minOrderMinor must be a non-negative number');
        } else {
          eligibility = { ...eligibility, minOrderMinor: Math.trunc(record['minOrderMinor']) };
        }
      }
      if (record['firstOrderOnly'] !== undefined) {
        eligibility = { ...eligibility, firstOrderOnly: record['firstOrderOnly'] === true };
      }
    }

    let reward: RewardTemplate | null | undefined;
    if (input.reward !== undefined) {
      if (input.reward === null) {
        reward = null;
      } else {
        try {
          reward = sanitizeRewardTemplate(input.reward, 'reward');
        } catch (error) {
          problem('reward', error instanceof GrowthConfigError ? error.message : 'reward is invalid');
        }
      }
    }
    const capTotal = input.capTotal === undefined ? undefined : input.capTotal;
    if (capTotal !== undefined && capTotal !== null && (!Number.isInteger(capTotal) || capTotal < 1)) {
      problem('capTotal', 'capTotal must be a positive whole number or null');
    }
    const ctaLabel = input.ctaLabel === undefined ? undefined : input.ctaLabel === null ? null : text(input.ctaLabel, 'ctaLabel');
    const ctaLink = input.ctaLink === undefined ? undefined : input.ctaLink;
    if (ctaLink && !ctaLink.startsWith('/')) {
      problem('ctaLink', 'ctaLink must be a path on this site');
    }

    if (problems.length > 0) {
      throw validationError('campaign is invalid', problems, 'CAMPAIGN_INVALID');
    }
    return { slug, kind, status, title, lede, points, startsAt, endsAt, eligibility, reward, capTotal, ctaLabel, ctaLink };
  }

  private async audit(eventType: string, entityId: string, operator: string, after: unknown): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        eventType,
        entityType: 'campaign',
        entityId,
        actorType: 'OPERATOR',
        actorId: operator,
        afterState: JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue,
      },
    });
  }
}
