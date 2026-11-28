# Voice and AI Integrations

## LiveKit voice SFU

BlueChat can issue short-lived LiveKit room tokens through `POST /api/voice/token`. The endpoint checks channel visibility, `connect`, and (when publishing) `speak` permissions.

Configure on the server:

- `LIVEKIT_URL` — LiveKit server URL.
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The browser client must use the returned `serverUrl`, `roomName`, and `token` with the LiveKit client SDK. The current branch adds token issuance but does not yet replace the existing browser voice experience with LiveKit room lifecycle, device selection, camera, screen-share, reconnect, stage, and network-quality UI.

Do not expose the API secret to the browser. Deploy LiveKit with appropriate TURN/STUN and firewall configuration.

## Optional AI summaries

BlueChat supports an OpenAI-compatible chat-completions endpoint, including a local Ollama-compatible endpoint.

Configure:

- `AI_BASE_URL` — defaults to `http://localhost:11434/v1`.
- `AI_MODEL` — required unless the server's AI settings specify a model.
- `AI_API_KEY` — optional for local providers; required by most hosted providers.

A server owner/admin must explicitly enable AI and the summary capability in server AI settings. A user must be a server member and have channel visibility plus read-message-history permission. Only the latest 100 messages in that authorized channel are sent for a summary. BlueChat does not persist the summary or provider prompt.

The provider is external to BlueChat and may apply its own retention policy. Review provider privacy terms before enabling hosted AI. AI search, transcription, knowledge retrieval, and automated moderation actions are not yet implemented.
