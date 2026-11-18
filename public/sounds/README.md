# blueChat sounds

Drop your own audio files in this folder — subfolders are supported. The app builds `index.json` from this folder automatically, so every file shows up in **Settings → Sounds** where each user can choose their favourite sound for:

- New notification
- Message sent
- Incoming call
- Sign in

Each event can be set to **Default**, **Silent**, or any sound you added. The **Play** button previews the chosen sound.

Supported extensions: `.mp3`, `.wav`, `.ogg`, `.oga`, `.m4a`, `.aac`, `.webm`, `.flac`, `.aiff`, `.opus`.

Examples:

```text
public/sounds/notification.mp3
public/sounds/Notification/mario.mp3
public/sounds/Message/message-sent.mp3
```

Notes:

- `index.json` is regenerated when you add or remove a sound while the dev server is running, or by running `npm run sounds:index`. It is also regenerated on `npm run dev` / `npm run build`.
- If no sound is chosen, blueChat falls back to the classic filenames (`notification.mp3`, `message-sent.mp3`, `calling.mp3`, `login.mp3`, plus a few aliases).
- If a file is missing, that event is silent. Nothing breaks.
- Calling audio loops while a call rings and stops when the call connects or ends.
- The **Sounds** toggle in Settings → Notifications mutes every event.
- Refresh the page after adding or replacing files if the picker does not update.
