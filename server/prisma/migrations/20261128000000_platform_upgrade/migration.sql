-- Additive BlueChat platform-upgrade migration.
-- Existing tables and rows are not modified or dropped.
CREATE TABLE "polls" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "multipleChoice" BOOLEAN NOT NULL DEFAULT false,
  "anonymous" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "polls_messageId_key" ON "polls"("messageId");
CREATE INDEX "polls_channelId_createdAt_idx" ON "polls"("channelId", "createdAt");

CREATE TABLE "poll_options" (
  "id" TEXT NOT NULL,
  "pollId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "poll_options_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "poll_options_pollId_position_idx" ON "poll_options"("pollId", "position");

CREATE TABLE "poll_votes" (
  "id" TEXT NOT NULL,
  "optionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "poll_votes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "poll_votes_optionId_userId_key" ON "poll_votes"("optionId", "userId");
CREATE INDEX "poll_votes_userId_createdAt_idx" ON "poll_votes"("userId", "createdAt");

CREATE TABLE "saved_messages" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "saved_messages_userId_messageId_key" ON "saved_messages"("userId", "messageId");
CREATE INDEX "saved_messages_userId_createdAt_idx" ON "saved_messages"("userId", "createdAt");

CREATE TABLE "read_receipts" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "lastReadMessageId" TEXT,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "read_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "read_receipts_userId_channelId_key" ON "read_receipts"("userId", "channelId");

CREATE TABLE "scheduled_messages" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "processingAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scheduled_messages_scheduledAt_sentAt_cancelledAt_idx" ON "scheduled_messages"("scheduledAt", "sentAt", "cancelledAt");
CREATE INDEX "scheduled_messages_authorId_createdAt_idx" ON "scheduled_messages"("authorId", "createdAt");

CREATE TABLE "server_events" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "channelId" TEXT,
  "creatorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "server_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "server_events_serverId_startsAt_idx" ON "server_events"("serverId", "startsAt");

CREATE TABLE "event_rsvps" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'GOING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_rsvps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_rsvps_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "server_events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "event_rsvps_eventId_userId_key" ON "event_rsvps"("eventId", "userId");

CREATE TABLE "bot_applications" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "avatar" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "bot_applications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bot_applications_ownerId_createdAt_idx" ON "bot_applications"("ownerId", "createdAt");

CREATE TABLE "bot_tokens" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bot_tokens_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "bot_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bot_tokens_tokenHash_key" ON "bot_tokens"("tokenHash");
CREATE INDEX "bot_tokens_applicationId_revokedAt_idx" ON "bot_tokens"("applicationId", "revokedAt");

CREATE TABLE "platform_webhooks" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_webhooks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_webhooks_tokenHash_key" ON "platform_webhooks"("tokenHash");
CREATE INDEX "platform_webhooks_serverId_channelId_idx" ON "platform_webhooks"("serverId", "channelId");

CREATE TABLE "webhook_deliveries" (
  "id" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "responseCode" INTEGER,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_deliveries_webhookId_eventId_key" ON "webhook_deliveries"("webhookId", "eventId");
CREATE INDEX "webhook_deliveries_status_nextAttemptAt_idx" ON "webhook_deliveries"("status", "nextAttemptAt");

CREATE TABLE "platform_subscriptions" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "serverId" TEXT,
  "provider" TEXT NOT NULL,
  "providerCustomerId" TEXT,
  "providerSubId" TEXT,
  "plan" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_subscriptions_providerSubId_key" ON "platform_subscriptions"("providerSubId");
CREATE INDEX "platform_subscriptions_userId_status_idx" ON "platform_subscriptions"("userId", "status");
CREATE INDEX "platform_subscriptions_serverId_status_idx" ON "platform_subscriptions"("serverId", "status");

CREATE TABLE "server_ai_settings" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "provider" TEXT,
  "model" TEXT,
  "allowSummary" BOOLEAN NOT NULL DEFAULT false,
  "allowSearch" BOOLEAN NOT NULL DEFAULT false,
  "allowTranscription" BOOLEAN NOT NULL DEFAULT false,
  "retentionDays" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "server_ai_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "server_ai_settings_serverId_key" ON "server_ai_settings"("serverId");

 
CREATE TABLE "forum_posts" (
  "id" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "forum_posts_channelId_isArchived_createdAt_idx" ON "forum_posts"("channelId", "isArchived", "createdAt");
CREATE INDEX "forum_posts_authorId_createdAt_idx" ON "forum_posts"("authorId", "createdAt");

CREATE TABLE "server_onboarding" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "welcomeMessage" TEXT,
  "rules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "defaultChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requireRuleAccept" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "server_onboarding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "server_onboarding_serverId_key" ON "server_onboarding"("serverId");

CREATE TABLE "server_member_screening" (
  "id" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "answers" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "server_member_screening_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "server_member_screening_serverId_userId_key" ON "server_member_screening"("serverId", "userId");
