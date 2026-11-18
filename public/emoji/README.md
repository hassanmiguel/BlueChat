# Custom emoji

blueChat reads `manifest.json` in this folder. Each entry has a shortcode and an image URL:

```json
{
  "version": 1,
  "emojis": [
    { "name": "party_parrot", "url": "/emoji/party_parrot.gif" },
    { "name": "tada2", "url": "/emoji/party_parrot.gif", "aliasFor": "party_parrot" }
  ]
}
```

Type or pick `:party_parrot:` in chat and it renders as the image. The picker in DMs and channels searches these names.

## Emoji.gg packs (installed)

All emoji from the [emoji.gg packs API](https://emoji.gg/api/packs) are bundled here: 2,328 images across 100 packs, stored in `emojigg/` and listed in `manifest.json` with their pack names. Use the pack dropdown or search in the picker, then type `:shortcode:` in chat (for example `:angry_frieren:`).

To refresh them:

```bash
npm run emoji:import:gg
```

Add `--remote` to keep emoji.gg CDN links instead of downloading a local copy, `--packs-json <file>` to import from a saved API response, `--concurrency 4` to throttle downloads, or `--force` to re-download. Existing non-emoji.gg entries in the manifest are preserved. Please respect emoji.gg's API terms and the licenses of the original emoji creators.

## Importing emojme emoji

This app is compatible with the output of [emojme](https://github.com/jackellenberger/emojme). emojme needs your own Slack credentials; blueChat does not store them.

```bash
# 1. Export/download with emojme (example)
emojme download --subdomain myteam --save

# 2. Convert its adminList.json + downloaded images
npm run emoji:import -- \
  --list build/myteam.adminList.json \
  --source build/myteam \
  --out public/emoji

# 3. Refresh blueChat
```

`--source` should point at the directory containing the downloaded images. Remote `http(s)` URLs in the admin list are kept as links; use `--save` and pass `--source` if you want the images bundled locally. Aliases are preserved.

You can also edit `manifest.json` by hand and drop image files next to it.
