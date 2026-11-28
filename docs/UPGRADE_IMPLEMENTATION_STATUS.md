# BlueChat Platform Upgrade — Implementation Status

**Working branch:** `audit/discord-platform-upgrade`  
**Target branch:** `master`  
**Status:** Broad implementation in progress; not production-ready.

The requested instruction was to add upgrade features without running tests. Accordingly, no test suite, typecheck, lint, Prisma validation/generation, build, migration, or runtime command has been executed during this work.

## Implemented in this branch

### Security and authorization
- Central channel permission evaluation combining server role permissions and channel overrides.
- Explicit deny precedence for channel role overrides.
- Channel visibility checks applied to channel listing/access, message access, and Socket.IO channel room joins.
- Channel-level permission middleware used for sending messages, attaching files, pinning, and moderator edits.
- Role hierarchy checks for role editing/deletion and role assignment/removal.
- Role IDs are checked against the target server before assignment.
- Default Member role assigned when a user joins; migration backfills existing members and baseline permissions.
- Required onboarding rule acceptance gates channel visibility.
- Socket voice-room join requires connect permission; mute/deafen/leave require actual room membership (existing branch change).
- Explicit trusted-proxy hop configuration (existing branch change).

### Messaging and community
- Poll persistence, creation, single/multiple-choice voting, closing, anonymous voter privacy, and in-message rendering.
- Personal saved messages with a Community Hub collection and context-menu save action.
- Per-user channel read cursors and active-channel read-state synchronization.
- Scheduled message persistence, cancellation, and server-side dispatcher with database leases and atomic message/dispatch completion.
- Scheduled messages re-check membership, permissions, timeout, slow mode, and AutoMod before sending.
- Server events with RSVP states.
- Forum channel posts, tags, lock/pin/archive controls, and a forum-channel UI.
- Server onboarding configuration, welcome/rules fields, default channels, and rule acceptance screening.
- Expiring/use-limited server invites; join consumes invite usage atomically and checks active bans.
- Configurable AutoMod rules for blocked phrases, mention limits, link limits, and duplicate messages; applied to normal and scheduled messages.

### Developer platform and integrations
- Bot application registration, community installation, scoped bot token issuance/revocation, bot token authentication, installation listing, and permission-checked channel message posting. Token plaintext is returned once; only hashes are stored.
- Channel webhook creation/deletion/listing with one-time credentials.
- Incoming webhook message endpoint with token + secret verification, rate limiting, idempotency key support, and webhook display identity.
- Optional AI server settings with opt-in summary/search/transcription flags and retention configuration.
- Optional OpenAI-compatible channel summarization endpoint, including local Ollama-compatible base URLs. It checks server opt-in and channel access; summary content is not persisted by BlueChat.
- LiveKit SFU token endpoint with channel visibility, connect, and speak permission checks.

### Upload privacy
- New file attachments are stored outside the public static uploads directory.
- Private download route requires authentication and either ownership or access through a message/channel or DM participant.
- Message and DM send routes verify ownership of private uploaded files before attaching them.
- Existing public avatar/banner media paths remain compatible.

### Client experience
- Community Hub navigation and UI for events, saved messages, scheduled messages, and developer applications.
- Poll composer controls and poll rendering/voting in channel messages.
- Forum-specific channel UI.
- API client methods for the new community, moderation, developer, onboarding, voice, and AI endpoints.
- Environment examples document private storage, LiveKit, and optional AI provider configuration.

## Added persistence

The additive Prisma schema and SQL migration add:
- Polls, poll options, votes.
- Saved messages and read receipts.
- Scheduled messages and processing lease.
- Server events and RSVPs.
- Bot applications and hashed bot tokens.
- Platform webhooks and webhook delivery records.
- Platform subscriptions and server AI settings.
- Forum posts.
- Server onboarding and member screening.
- Private upload metadata.
- AutoMod rules.

Migration files:
- `server/prisma/migrations/migration_lock.toml`
- `server/prisma/migrations/20261128000000_platform_upgrade/migration.sql`

## Still incomplete or dependent on external services

These items must not be treated as complete:

1. **Voice/video client:** Server-side LiveKit token issuance is present, but the browser still needs LiveKit client integration, room lifecycle UI, device selection, camera/screen-share controls, reconnect behavior, stage speaker/audience controls, and SFU deployment/TURN configuration.
2. **Bot runtime/interactions:** Applications and tokens can be created/revoked, but bot installation/authorization, bot-authenticated REST endpoints, slash-command registration/dispatch, interaction callbacks, and component interactions remain.
3. **Webhook delivery:** Incoming webhooks can post messages. Outbound event subscriptions, retry worker, delivery management UI, and signing/verification for outgoing deliveries remain.
4. **Billing:** Subscription storage/read API exists only. Checkout, provider webhooks, signature verification, idempotent reconciliation, refunds, cancellation, and entitlement enforcement require a selected billing provider and credentials.
5. **AI:** Server opt-in/settings and channel summarization exist. AI-assisted search, moderation suggestions, knowledge retrieval, transcription, provider-specific adapters, and retention/deletion workflows remain.
6. **Forums:** Posts and moderation state exist; threaded replies/comments, accepted answers, tag administration, sorting controls, and richer moderation UI remain.
7. **Onboarding:** Rules acceptance and settings exist; guided question flows, screening review queue, member verification, welcome notifications, and server templates remain.
8. **Media:** Private local storage is implemented for new attachments; object storage/S3 adapter, malware scanning, quotas, retention cleanup, safe preview pipeline, and migration of old public attachments remain.
9. **Security:** SSRF-safe link unfurling is not implemented; no link preview fetcher should be enabled until DNS/IP/redirect protections exist. More complete session/device management, refresh-token rotation audit, CSRF/CSP review, account recovery hardening, and exhaustive IDOR review remain.
10. **Analytics and operations:** Privacy-preserving community insights, structured telemetry, distributed rate limiting, queue infrastructure, backup/restore drills, alerting, deployment automation, and incident runbooks remain.
11. **Accessibility and mobile:** New UI surfaces need keyboard/screen-reader review, responsive QA, reduced-motion review, and broader mobile layout work.
12. **Premium cosmetics/server boosts:** Entitlement schema exists, but feature gating and payment integration do not.

## Manual handoff

When ready to test locally:
1. Check out `audit/discord-platform-upgrade`.
2. Install root and server dependencies.
3. Run Prisma client generation from `server`.
4. Review the SQL migration against a backup/staging copy of the current PostgreSQL schema before applying it.
5. Run the user's preferred typecheck, lint, build, migration, and functional/security test workflow.
6. Configure `PRIVATE_UPLOAD_DIR`; optionally configure LiveKit and AI environment variables.
7. Keep `master` unchanged until the user has completed verification and reviewed the draft PR.

No claim is made that the branch currently builds or runs successfully.
