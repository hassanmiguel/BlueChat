# BlueChat Developer API

## Bot tokens

Create a bot application from Community Hub → Developer apps. Issue a token with the minimum required scopes. The plaintext token is displayed once; BlueChat stores only its SHA-256 hash. Revoke and replace tokens immediately if exposed.

Send the token using the `Authorization: Bot <token>` header.

### Current endpoints

- `GET /api/bots/v1/application` — application identity and granted token scopes.
- `GET /api/bots/v1/installations` — installed servers; requires `read_members`.
- `POST /api/bots/v1/channels/:channelId/messages` — create a channel message; requires the `send_messages` token scope, a server installation granting `send_messages`, and the installing member to retain channel permission.

Example message payload:

```json
{ "content": "Hello from my BlueChat bot." }
```

Bot messages are associated with the bot application and displayed with a BOT badge. The installing member is retained as the authorization principal; if that member leaves, is timed out, or loses channel send permission, the bot cannot post.

## Incoming channel webhooks

Create a channel webhook from a server with Manage Webhooks permission. The token and secret are returned once.

Send:

- `POST /api/webhooks/:webhookId/messages`
- `Authorization: Bearer <token>`
- `X-BlueChat-Secret: <secret>`
- Optional `Idempotency-Key: <unique-event-id>`

Payload:

```json
{ "content": "Deployment completed.", "username": "Release Bot" }
```

The webhook is rate-limited and checks that the creator still has channel send permission. Reuse of an idempotency key does not create a second message.

## Security notes

- Never put bot tokens or webhook secrets in URLs, client bundles, source control, or logs.
- Use least-privilege scopes and installation permissions.
- Rotate credentials after suspected exposure.
- Outbound webhook subscriptions/retry delivery are not yet implemented.
- Slash-command registration, interaction callbacks, message components, and bot gateway events remain future work.
