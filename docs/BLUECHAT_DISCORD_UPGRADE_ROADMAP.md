# BlueChat Discord-Level Upgrade: Audit, Roadmap, and Security Plan

## Purpose

Evolve BlueChat into a full-featured real-time community platform with Discord-class capabilities while preserving BlueChat's identity, current users, existing data, and established React/TypeScript, Express, Socket.IO, PostgreSQL, and Prisma architecture.

This is an implementation roadmap, not a claim that every listed feature already exists or is complete. Each feature must be delivered as a working end-to-end workflow, covered by tests, and documented with any external infrastructure requirements.

## Baseline architecture observed

- Web client: React 18, TypeScript, Vite, Zustand, React Router, Framer Motion, Tailwind, and Socket.IO client.
- Server: Node.js, Express, TypeScript, Socket.IO, Zod, and express-rate-limit.
- Persistence: PostgreSQL through Prisma.
- Existing route areas include authentication, OAuth, servers, channels, messages, DMs, friends, users, uploads, moderation, notifications, and search.
- Existing Prisma entities include users, sessions, servers, members, roles, categories, channels, permission overrides, messages, edits, attachments, reactions, mentions, threads, direct messages, friend requests, blocks, invites, bans, timeouts, audit logs, notifications, and reports.
- Existing UI components/pages include server/channel navigation, chat, member list, DMs, calls, notifications, settings, discovery, search, threads, emoji picker, invite flows, moderation, and voice controls.

These observations are based on source inspection. They do not certify that every route, UI action, or real-time workflow is currently correct or production-ready. A runtime test pass is still required.

## Delivery principles

1. Audit before rewriting. Trace every feature from UI to API/socket handler to database.
2. Preserve existing data. Use additive Prisma migrations; never reset or drop production tables as a shortcut.
3. Keep master protected. Work on feature branches and submit reviewable pull requests.
4. No mock functionality presented as complete. Every control must perform its real action or be clearly marked unavailable.
5. Keep authorization on the server. Never trust client-supplied user IDs, roles, permissions, channel IDs, or ownership claims.
6. Use transactions for multi-record operations and enforce ownership/membership constraints at the database boundary where possible.
7. Add tests for normal behavior, authorization failures, malformed input, abuse cases, and regressions.
8. External services must be explicit adapters with documented setup, secrets, limits, and fallback behavior.
9. Do not copy Discord branding, assets, or proprietary implementation. Build BlueChat's own identity and interaction design.

## Feature roadmap

### 1. Messaging

- Reliable real-time channel and DM messaging with reconnect/resync and duplicate-event protection.
- Message editing history, soft deletion, replies, threads, pins, reactions, mentions, and permission-aware search.
- Markdown, code blocks with syntax highlighting, link previews with SSRF-safe unfurling, embeds, spoiler content, polls, and scheduled messages.
- Drafts, saved/bookmarked messages, forwarding with attribution, read state, typing indicators, and per-conversation notification controls.
- Image/video/audio/file attachments, voice notes, upload progress, previews, safe download behavior, and configurable limits.
- GIFs, stickers, custom emoji, and accessibility labels.

### 2. Servers and communities

- Server profiles, icons, banners, descriptions, invite links with expiry/usage limits, vanity URLs where supported, and server templates.
- Categories, text/voice/announcement/forum/stage channels, channel topics, slow mode, NSFW gating, and channel-specific permission overrides.
- Onboarding, rules screening, welcome flows, default channels, member verification, community discovery, events, and scheduled events.
- Forum posts with tags, sorting, accepted answers, and archive/lock controls.
- Community insights and server analytics with privacy-aware aggregation.

### 3. Voice, video, and streaming

- Implement real multi-user voice using a dedicated WebRTC SFU integration (for example LiveKit or another evaluated provider), not a Socket.IO audio relay.
- Device selection, microphone/camera permissions, mute/deafen, push-to-talk, voice activity detection, input/output volume, reconnect, and network-quality indicators.
- Video calls, screen sharing, stream quality controls, stage channels, speaker/audience roles, and moderation controls.
- Consent-aware recording only if explicitly designed, legally reviewed, and visibly indicated.
- Document TURN/STUN, SFU hosting, bandwidth, scaling, and operational costs.

### 4. Profiles and social

- Avatars, banners, profile themes, about-me, pronouns as optional user-controlled data, custom status, presence, and activity sharing with privacy controls.
- Friends, requests, blocks, mutes, mutual servers, DM privacy settings, and session/device management.
- Respect invisible/offline and notification privacy settings across REST and Socket.IO.

### 5. Roles, permissions, and moderation

- Centralized permission evaluation with explicit deny/allow precedence and role hierarchy.
- Server and channel permission management for members, roles, and channel overrides.
- Ban, unban, timeout, kick, reports, appeals, audit log, moderator notes, and bulk moderation with confirmation.
- AutoMod rules for blocked words, spam, repeated mentions, suspicious links, raid detection, and configurable actions.
- Verification levels, new-account friction, slow mode, rate limits, and anti-abuse controls.
- Ensure users cannot manage roles at or above their own authority or grant permissions they do not possess.

### 6. Bots and developer ecosystem

- Bot/application registration, scoped tokens, token rotation/revocation, and secure secret storage.
- Slash commands, message components (buttons/select menus), interactions, webhooks, event subscriptions, and bot permission scopes.
- Public developer documentation, API versioning, request signatures, rate limits, audit logs, and sandbox/testing tools.
- Never expose bot tokens in client bundles, logs, URLs, or error messages.

### 7. Client experience

- Responsive desktop/mobile layouts, accessible keyboard navigation, screen-reader labels, focus management, and reduced-motion support.
- Light/dark themes, per-server appearance options, compact/cozy density, customizable keybinds, quick switcher, and command/search palette.
- Notification preferences, DND, desktop notifications with permission controls, unread markers, and sound preferences.
- PWA/offline shell where appropriate; evaluate native desktop clients only after web functionality is stable.

### 8. Premium and customization

- Optional subscriptions with a provider-backed billing integration, server boosts, cosmetic customization, expanded upload limits, and premium perks.
- Server-side entitlement verification, webhook signature validation, idempotent billing events, cancellation/refund handling, and transparent pricing.
- No fake checkout, simulated payments, or client-trusted entitlement flags.

### 9. BlueChat-native AI capabilities

- Optional assistant for summaries, search assistance, and server knowledge retrieval.
- Moderation suggestions must be reviewable and must not silently take high-impact actions without configured policy.
- Optional speech transcription with clear consent and retention controls.
- AI features must be opt-in, permission-aware, rate-limited, and never use private content outside the user's authorized scope.

## Security review and required controls

### Implemented in this branch

- Replaced unconditional Express proxy trust (one hop) with explicit TRUST_PROXY_HOPS configuration. Default is zero (no trusted proxy). Deployments behind a known reverse proxy should set the exact trusted hop count. This prevents blindly trusting forwarded client-IP headers when no trusted proxy is configured.
- Tightened Socket.IO authentication to require a valid access-token type and a non-empty string user ID.
- Fixed voice-room authorization: joining now requires the server-side connect permission, and mute/deafen/leave events are accepted only from sockets that actually joined that voice room. This prevents clients from spoofing another room's voice state.

### Verify and strengthen before production

- Authentication: use revocable, server-tracked refresh sessions; rotate refresh tokens; revoke on logout/password reset; invalidate sessions after credential changes; enforce secure cookie settings and CSRF checks on cookie-authenticated mutations.
- Socket.IO: authenticate handshake, authorize every room join and event, validate payload schemas, rate-limit events, prevent cross-server/channel room access, and cleanly revoke disconnected/expired sessions.
- Authorization: systematically test IDOR/BOLA cases on every resource route, especially messages, DMs, attachments, invites, role management, reports, and moderation.
- Uploads: enforce byte-level type checks, size/count limits, safe generated names, storage quotas, malware scanning where appropriate, private object storage or signed URLs for private media, and safe content-disposition/content-type headers.
- Link previews: block localhost, private, link-local, and metadata IP ranges; revalidate every redirect and DNS resolution to prevent SSRF.
- Web security: maintain strict CORS allowlists, CSP, HSTS in HTTPS production, secure cookies, request size limits, safe error responses, and dependency auditing.
- Abuse resistance: endpoint-specific rate limits, per-user and per-IP limits, spam controls, mention limits, invite abuse controls, and operational alerting.
- Data: least-privilege database credentials, backups and restore drills, retention/deletion policies, audit-log integrity, and secret rotation.
- Privacy: minimize public profile fields, protect email addresses, and enforce private-channel/DM access in search, notifications, previews, and sockets.

## Suggested implementation sequence

1. Complete a route/socket/UI audit and baseline build/typecheck/test run. Record concrete defects and add regression tests.
2. Security foundation: trusted proxy configuration (started), session lifecycle, socket authentication/authorization, centralized permission tests, upload and SSRF hardening.
3. Messaging completion: threads, read state, bookmarks, polls, scheduled messages, voice notes, rich embeds, search, and robust reconnect.
4. Server/community completion: onboarding, invites, forum/event workflows, channel overrides, moderation/AutoMod, audit trails, and analytics.
5. Voice/video: select and integrate an SFU, then implement real calls, stage channels, and screen sharing.
6. Developer ecosystem: bot registration, scopes, interactions, webhooks, and API docs.
7. Client polish and accessibility; then premium billing and opt-in AI features.
8. Production readiness: load/security tests, observability, backups, deployment documentation, and incident procedures.

## Acceptance criteria for each feature

- UI, API, socket events, and persistence are connected end-to-end.
- Permission checks are enforced server-side and negative authorization tests pass.
- Inputs are schema-validated and abuse/rate limits are applied.
- Loading, empty, error, retry, and offline states are implemented.
- Tests cover success, failure, concurrency, and regression paths.
- Typecheck, build, and relevant tests pass; any unavailable external service is clearly documented.
- Migrations are reviewed and safe for existing data.
