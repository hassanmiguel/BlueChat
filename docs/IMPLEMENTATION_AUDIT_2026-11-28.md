# BlueChat Discord-Level Upgrade — Repository Audit

**Audit date:** 2026-11-28  
**Repository:** https://github.com/hassanmiguel/BlueChat  
**Audited branch:** `master` at `a6245afb2c75484108b1e82561aa408fd84bb45e`  
**Working branch:** `audit/discord-platform-upgrade`

This document records source-level findings from the repository. It is not a claim that runtime tests or production deployment checks have passed.

## 1. Existing architecture confirmed

- React 18, TypeScript, Vite, Zustand, React Router, and Socket.IO client.
- Express 4, TypeScript, Socket.IO, Prisma 5, PostgreSQL, Zod, and express-rate-limit.
- Existing API areas: authentication, OAuth, servers, channels, messages, DMs, friends, users, uploads, moderation, notifications, and search.
- Existing UI includes server/channel navigation, chat, member list, DMs, calls, notifications, settings, discovery, search, threads, emoji picker, invites, and voice controls.
- Existing schema includes users, sessions, servers, members, roles, categories, channels, channel permission overrides, messages, message edits, attachments, reactions, mentions, threads, DMs, friends, blocks, invites, bans, timeouts, audit logs, notifications, and reports.

## 2. Confirmed implementation gaps and risks

### P0 — Authorization consistency

1. `server/src/middleware/authz.ts` defines channel permission overrides in the database schema but `hasServerPermission` evaluates only server roles. `requireChannelPermission` delegates to that server-level check and does not evaluate channel-specific allow/deny rules.
2. `requireChannelAccess` and `requireMessageAccess` verify server membership (and timeout in one path), but do not apply a unified channel visibility/read permission check.
3. The Socket.IO `channel:join` handler checks server membership before joining a channel room, but does not use a centralized channel permission resolver. Every room join and event must use the same authorization policy as REST.
4. Permission evaluation needs explicit deny precedence, owner/admin handling, role hierarchy, channel overrides, and regression tests for cross-server and cross-channel access.

### P0 — Upload access and validation

1. Uploads are written to a local directory and returned as public URLs.
2. Express serves `/uploads` through static middleware, so private attachment access is not currently enforced at download time.
3. Upload validation includes MIME/extension checks and selected magic-byte checks, but the production design still needs storage abstraction, private object access or signed URLs, quotas, safer content-disposition behavior, and malware-scanning integration where available.
4. Validate archive/document formats safely; a ZIP signature alone does not establish that an Office document is benign.

### P1 — Quality gates

1. The root and server package manifests do not currently define automated test scripts.
2. Establish unit, integration, socket authorization, and browser-level regression suites before large feature work.
3. Record the baseline typecheck/build/test results in CI. Do not report commands as passed unless they were actually executed.

### P1 — Feature coverage to verify/implement

The schema and route inventory do not yet demonstrate complete end-to-end implementations for polls, scheduled messages, saved messages, robust read/delivery receipts, server events/RSVP, onboarding and screening, bot applications/tokens/interactions, webhook delivery, subscription billing, and AI integrations.

The current voice signaling implementation should not be represented as scalable multi-user voice. Select and configure an SFU (for example, LiveKit) before claiming production voice rooms, group video, or screen sharing.

### P1 — Data model and operational readiness

- Extend Prisma additively; never reset or destructively replace existing databases.
- Add migrations, indexes, constraints, retention policies, and transaction boundaries with review.
- Document Redis/queue usage only where the deployment topology requires it.
- Add health/readiness checks, structured logs, backups, restore drills, monitoring, and production environment validation.

## 3. Required implementation order

1. Baseline tests and threat-model review.
2. Centralized REST + Socket.IO permission resolver, including channel overrides.
3. Private attachment access and hardened upload/storage pipeline.
4. Session lifecycle, refresh-token rotation/revocation, and account security review.
5. Messaging completeness: read states, bookmarks, polls, scheduling, thread membership, and reconnect/resync.
6. Server/community completeness: onboarding, invites, events, forums, role hierarchy, and audit logs.
7. Friends, presence, DM privacy, and notification preferences.
8. Real SFU-backed voice/video/screen sharing with deployment documentation.
9. Moderation and anti-abuse workflows.
10. Bot/developer APIs and signed webhooks.
11. Optional premium billing and opt-in AI integrations.
12. Accessibility, responsive behavior, performance, CI, and production readiness.

## 4. Rules for contributors and coding agents

- Work on a feature branch and submit a reviewable pull request; do not push unreviewed broad changes directly to `master`.
- Inspect the relevant existing route, service, schema, socket handler, frontend store/component, and tests before editing.
- Preserve existing user data and working behavior.
- No fake buttons, mock APIs, placeholder implementations, or claims of completion without end-to-end verification.
- Every protected operation must authorize on the server; never trust client-provided identity, role, ownership, or room membership.
- Add regression tests for both allowed and denied access paths.
- Use additive Prisma migrations. Never use `prisma db push` or database reset as a production migration strategy.
- Do not add secrets to source control. Add only safe variable names and explanations to `.env.example`.
- External services must fail clearly and remain optional until configured.
- Update this audit as findings are resolved, with links to commits/tests and explicit blocked dependencies.

## 5. Changes made on the working branch

The following source changes have been committed on `audit/discord-platform-upgrade`:

- Added a channel-level permission resolver that combines server role permissions with channel role overrides.
- Applied explicit deny precedence over channel allow overrides, while retaining owner/administrator bypass behavior.
- Updated channel permission middleware and channel-manager middleware to use the channel-level resolver.
- Added a backward-compatible channel visibility check: server membership grants visibility by default, while a matching role override can explicitly deny `view_channel`.
- Applied that visibility check to channel access, message access, and Socket.IO channel-room joins.

These are source-level changes only. They have **not** yet been typechecked or exercised against a live database/socket server in this environment. Review and add regression tests before merging.

## 6. Verification status

**Not verified in this source-only audit:** runtime behavior, database migration execution, typecheck, lint, automated tests, production builds, browser behavior, load tests, SFU connectivity, billing provider webhooks, and deployment configuration.

A feature is complete only after its database, backend, authorization, real-time behavior, frontend, tests, and documentation are all implemented and verified.
