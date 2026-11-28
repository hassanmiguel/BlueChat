# BlueChat Contributor Instructions

Read these files before making changes:

- `docs/BLUECHAT_DISCORD_UPGRADE_ROADMAP.md`
- `docs/IMPLEMENTATION_AUDIT_2026-11-28.md`

## Mission

Evolve this existing repository into a secure, reliable, Discord-class communication and community platform while preserving BlueChat's identity, existing users, existing data, and working functionality. Implement real end-to-end features; do not build a disconnected demo or frontend-only imitation.

## Mandatory workflow

1. Inspect the current implementation and trace the requested feature through Prisma, server services/routes, Socket.IO, frontend state/UI, and tests.
2. Work in small, reviewable commits on a feature branch. Do not push directly to `master`.
3. Implement one coherent vertical slice at a time: schema/migration → backend → authorization → REST/Socket.IO → frontend → tests → documentation.
4. Run the relevant typecheck, lint, tests, and production build after each slice. If a command cannot run, report why; never invent a passing result.
5. Update the implementation audit with resolved findings, commit references, verification evidence, and remaining blockers.
6. Continue through the roadmap phases. Do not stop after producing a plan.

## Non-negotiable safety and engineering rules

- Never reset, drop, truncate, or overwrite production data. Use reviewed, additive Prisma migrations.
- Never bypass authorization to make a feature appear functional. Enforce permissions in REST handlers and Socket.IO handlers, not merely by hiding UI controls.
- Use one centralized permission evaluator for server roles, role hierarchy, channel overrides, explicit deny precedence, and owner/admin rules.
- Validate all untrusted HTTP and socket payloads with schemas; rate-limit sensitive and abuse-prone operations.
- Protect private messages, channels, attachments, search results, notifications, and socket rooms against IDOR/BOLA and cross-tenant access.
- Store secrets only in environment/configuration systems. Never commit real keys, tokens, passwords, or private URLs.
- Use idempotency and duplicate-event protection for messaging, notifications, webhooks, and billing.
- Uploads require byte-level validation, generated storage names, size/count limits, private access controls where appropriate, and safe download headers. Do not trust filename extensions or client MIME declarations.
- Use a maintained SFU for scalable multi-user voice/video. Do not describe peer-to-peer signaling or a mock screen as production group voice.
- External integrations (email, SFU, object storage, billing, AI, Redis) must be optional until configured and must document their dependencies.
- No placeholder buttons, fake API responses, simulated payment success, or unimplemented controls presented as complete.
- Preserve existing UI/design conventions and add responsive, keyboard-accessible behavior.

## Delivery reporting

At the end of each work session, report:

- Files and workflows changed.
- Features completed versus partial or blocked.
- Migrations added (and whether they were actually applied).
- Tests/builds actually executed and their exact outcomes.
- Required environment variables and external services.
- Known risks and next implementation slice.

Do not claim the entire Discord-level objective is complete until every acceptance criterion in the roadmap is verified.
