-- Growth: the reward ledger, EasyDrop, EasyClub, referral, campaigns.
--
-- Additive only. New tables, new enums, and three nullable columns on existing
-- tables (checkout_sessions.reward_id / benefits_snapshot, orders.paid_at,
-- reviews.order_id). No row is rewritten and nothing is dropped, so the
-- migration is safe against a populated production database and the seed
-- that follows it stays upsert-only.
--
-- Generated with prisma migrate diff from prisma/schema.prisma and reviewed
-- by hand.
-- CreateEnum
CREATE TYPE "RewardKind" AS ENUM ('NEXT_ORDER_COINS', 'NEXT_ORDER_CREDIT', 'POINTS_BONUS', 'POINTS_MULTIPLIER', 'TIER_BOOST', 'OFFER_UNLOCK', 'EXTRA_COINS');

-- CreateEnum
CREATE TYPE "RewardSource" AS ENUM ('EASYDROP', 'EASYBACK', 'REFERRAL_REFERRER', 'REFERRAL_FRIEND', 'STREAK', 'FOUNDER', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'REDEEMED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EasyDropTier" AS ENUM ('DROP', 'DROP_PLUS', 'VIP');

-- CreateEnum
CREATE TYPE "EasyDropStatus" AS ENUM ('ISSUED', 'REVEALED', 'VOID');

-- CreateEnum
CREATE TYPE "CampaignKind" AS ENUM ('WEEKEND_DROP', 'MATCHDAY_DROP', 'PAYDAY_DROP', 'PROMO_DROP', 'COMMUNITY_DROP', 'VIP_DROP');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'QUALIFIED', 'REWARDED', 'REJECTED');

-- AlterTable
ALTER TABLE "checkout_sessions" ADD COLUMN     "benefits_snapshot" JSONB,
ADD COLUMN     "reward_id" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paid_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "order_id" TEXT;

-- CreateTable
CREATE TABLE "growth_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "growth_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "customer_rewards" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT,
    "session_id" TEXT,
    "source" "RewardSource" NOT NULL,
    "kind" "RewardKind" NOT NULL,
    "value" INTEGER NOT NULL,
    "status" "RewardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "title" JSONB NOT NULL,
    "source_order_id" TEXT,
    "redeemed_order_id" TEXT,
    "min_order_minor" INTEGER,
    "expires_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "easy_drops" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "session_id" TEXT,
    "tier" "EasyDropTier" NOT NULL,
    "status" "EasyDropStatus" NOT NULL DEFAULT 'ISSUED',
    "cards" JSONB NOT NULL,
    "picked_index" INTEGER,
    "reward_id" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealed_at" TIMESTAMP(3),

    CONSTRAINT "easy_drops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "founder_seats" (
    "customer_id" TEXT NOT NULL,
    "seat_number" INTEGER NOT NULL,
    "order_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "founder_seats_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "customer_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "referral_attributions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrer_customer_id" TEXT NOT NULL,
    "referred_customer_id" TEXT,
    "referred_session_id" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "order_id" TEXT,
    "reason" TEXT,
    "request_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "CampaignKind" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "title" JSONB NOT NULL,
    "lede" JSONB NOT NULL,
    "points" JSONB NOT NULL DEFAULT '[]',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "eligibility" JSONB NOT NULL DEFAULT '{}',
    "reward" JSONB,
    "cap_total" INTEGER,
    "claimed_count" INTEGER NOT NULL DEFAULT 0,
    "cta_label" JSONB,
    "cta_link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_claims" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "session_id" TEXT,
    "order_id" TEXT NOT NULL,
    "reward_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_rewards_customer_id_status_idx" ON "customer_rewards"("customer_id", "status");

-- CreateIndex
CREATE INDEX "customer_rewards_session_id_status_idx" ON "customer_rewards"("session_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_rewards_source_source_order_id_key" ON "customer_rewards"("source", "source_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "easy_drops_order_id_key" ON "easy_drops"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "easy_drops_reward_id_key" ON "easy_drops"("reward_id");

-- CreateIndex
CREATE INDEX "easy_drops_customer_id_idx" ON "easy_drops"("customer_id");

-- CreateIndex
CREATE INDEX "easy_drops_session_id_idx" ON "easy_drops"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "founder_seats_seat_number_key" ON "founder_seats"("seat_number");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referral_attributions_referred_customer_id_key" ON "referral_attributions"("referred_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_attributions_order_id_key" ON "referral_attributions"("order_id");

-- CreateIndex
CREATE INDEX "referral_attributions_referred_session_id_idx" ON "referral_attributions"("referred_session_id");

-- CreateIndex
CREATE INDEX "referral_attributions_referrer_customer_id_status_idx" ON "referral_attributions"("referrer_customer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_status_starts_at_idx" ON "campaigns"("status", "starts_at");

-- CreateIndex
CREATE INDEX "campaign_claims_campaign_id_customer_id_idx" ON "campaign_claims"("campaign_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_claims_campaign_id_order_id_key" ON "campaign_claims"("campaign_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_id_key" ON "reviews"("order_id");

-- AddForeignKey
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "customer_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_source_order_id_fkey" FOREIGN KEY ("source_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_rewards" ADD CONSTRAINT "customer_rewards_redeemed_order_id_fkey" FOREIGN KEY ("redeemed_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "easy_drops" ADD CONSTRAINT "easy_drops_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "easy_drops" ADD CONSTRAINT "easy_drops_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "customer_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "founder_seats" ADD CONSTRAINT "founder_seats_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_code_fkey" FOREIGN KEY ("code") REFERENCES "referral_codes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_claims" ADD CONSTRAINT "campaign_claims_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "auth_identities_provider_account_key" RENAME TO "auth_identities_provider_provider_account_id_key";

