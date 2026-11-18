#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const PACKS_API = 'https://emoji.gg/api/packs';
const CDN = 'https://cdn3.emoji.gg/emojis/';
const LOCAL_DIR = 'emojigg';

const help = `Import every emoji from the emoji.gg packs page into blueChat.

Usage:
  node scripts/import-emojigg.mjs [options]

Options:
  --out <dir>          Emoji output directory (default: public/emoji)
  --packs-json <file>  Use a saved copy of https://emoji.gg/api/packs (offline mode)
  --remote             Keep emoji.gg CDN URLs instead of downloading images
  --concurrency <n>    Parallel downloads (default: 10)
  --limit <n>          Only import the first n unique emoji (useful for testing)
  --force              Re-download images that already exist
  --help, -h           Show this help

Examples:
  npm run emoji:import:gg
  npm run emoji:import:gg -- --remote
  npm run emoji:import:gg -- --packs-json ./packs.json --concurrency 4
`;

function parseArgs(argv) {
  const args = {
    out: path.resolve(process.cwd(), 'public/emoji'),
    remote: false,
    concurrency: 10,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(help);
      process.exit(0);
    }
    if (!arg.startsWith('--')) continue;
    const [key, inline] = arg.slice(2).split('=', 2);
    const value = inline ?? argv[++i];
    if (key === 'remote') args.remote = true;
    else if (key === 'force') args.force = true;
    else if (key === 'concurrency') args.concurrency = Math.max(1, Number(value) || 10);
    else if (key === 'limit') args.limit = Math.max(1, Number(value) || 0);
    else args[key] = value;
  }
  return args;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempts = 5) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: 'application/json',
          'user-agent': 'blueChat-emoji-importer/1.0 (+local chat app)',
        },
      });
      if (response.status === 429) {
        await delay(1000 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await delay(500 * (attempt + 1));
    }
  }
  throw new Error(`Could not load ${url}`);
}

function decodeEntities(value) {
  let text = String(value ?? '');
  for (let pass = 0; pass < 3; pass += 1) {
    const next = text
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#0*39;|&apos;/gi, "'")
      .replace(/&#0*36;/g, '$')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&nbsp;/gi, ' ');
    if (next === text) break;
    text = next;
  }
  return text.trim();
}

const cleanName = (value) =>
  String(value ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+[-_]?/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const safeFile = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, '_');

function makeEntry(filename, packName, usedNames, usedFiles, index) {
  const trimmed = String(filename ?? '').trim();
  if (!trimmed) return null;

  const id = (trimmed.match(/^(\d+)/) || [])[1] || '';
  let name = cleanName(trimmed) || `emoji_${id || index + 1}`;
  if (usedNames.has(name)) name = id ? `${name}_${id}` : `${name}_${index + 1}`;
  let suffix = 2;
  while (usedNames.has(name)) name = `${name}_${suffix++}`;
  usedNames.add(name);

  let file = safeFile(trimmed);
  const dot = file.lastIndexOf('.');
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : '.png';
  let fileSuffix = 2;
  while (usedFiles.has(file.toLowerCase())) file = `${stem}_${fileSuffix++}${ext}`;
  usedFiles.add(file.toLowerCase());

  const remoteUrl = `${CDN}${encodeURIComponent(trimmed)}`;
  return {
    name,
    url: `/emoji/${LOCAL_DIR}/${file}`,
    remoteUrl,
    file,
    pack: packName,
    sourceFile: trimmed,
  };
}

async function existsNonEmpty(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

async function downloadOne(entry, dest) {
  if (!entry.remoteUrl) return false;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(entry.remoteUrl, {
        headers: {
          'user-agent': 'Mozilla/5.0 blueChat emoji importer',
          referer: 'https://emoji.gg/',
          accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });
      if (response.status === 429) {
        await delay(800 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) throw new Error('empty response');
      await fs.writeFile(dest, buffer);
      return true;
    } catch {
      if (attempt === 3) return false;
      await delay(400 * (attempt + 1));
    }
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(process.cwd(), args.out);
  const imageDir = path.join(outDir, LOCAL_DIR);
  await fs.mkdir(outDir, { recursive: true });
  if (!args.remote) await fs.mkdir(imageDir, { recursive: true });

  let packs;
  if (args.packsJson) {
    packs = JSON.parse(await fs.readFile(path.resolve(process.cwd(), args.packsJson), 'utf8'));
  } else {
    packs = await fetchJson(PACKS_API);
  }
  if (!Array.isArray(packs)) throw new Error('Unexpected packs API response');

  const usedNames = new Set();
  const usedFiles = new Set();
  const entries = [];

  for (const pack of packs) {
    const packName = decodeEntities(pack.name || pack.slug || 'emoji.gg').slice(0, 80);
    const refs = String(pack.emojis ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    for (const ref of refs) {
      const entry = makeEntry(ref, packName, usedNames, usedFiles, entries.length);
      if (entry) entries.push(entry);
    }
  }

  const selected = args.limit ? entries.slice(0, args.limit) : entries;
  console.log(`Found ${selected.length} unique emoji across ${packs.length} packs.`);

  const failed = [];
  if (!args.remote) {
    let cursor = 0;
    let done = 0;
    const worker = async () => {
      while (cursor < selected.length) {
        const entry = selected[cursor++];
        const dest = path.join(imageDir, entry.file);
        if (!args.force && (await existsNonEmpty(dest))) {
          done += 1;
          continue;
        }
        const ok = await downloadOne(entry, dest);
        if (!ok) failed.push(entry.name);
        done += 1;
        if (done % 100 === 0 || done === selected.length) {
          console.log(`  downloaded ${done}/${selected.length}`);
        }
      }
    };
    await Promise.all(Array.from({ length: args.concurrency }, worker));
    if (failed.length) {
      console.log(`Could not download ${failed.length} emoji; they will be skipped.`);
      failed.slice(0, 10).forEach((name) => console.log(`  - ${name}`));
    }
  }

  let preserved = [];
  const manifestPath = path.join(outDir, 'manifest.json');
  try {
    const existing = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const list = Array.isArray(existing) ? existing : Array.isArray(existing?.emojis) ? existing.emojis : [];
    preserved = list.filter(
      (item) => !String(item?.url ?? '').startsWith(`/emoji/${LOCAL_DIR}/`) && item?.source !== 'emoji.gg',
    );
  } catch {
    // No manifest yet.
  }

  const imported = selected
    .filter((entry) => args.remote || entry.url.startsWith(`/emoji/${LOCAL_DIR}/`))
    .filter((entry) => args.remote || !failed.includes(entry.name))
    .map((entry) => ({
      name: entry.name,
      url: entry.url,
      ...(entry.pack ? { pack: entry.pack } : {}),
      source: 'emoji.gg',
    }));

  const merged = [...preserved, ...imported];
  const seen = new Set();
  const output = merged.filter((item) => {
    if (!item?.name || seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
  output.sort((a, b) => a.name.localeCompare(b.name));

  await fs.writeFile(manifestPath, `${JSON.stringify({ version: 1, emojis: output }, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${output.length} emoji to ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
