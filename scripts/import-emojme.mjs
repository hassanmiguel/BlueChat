#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.png', '.gif', '.jpg', '.jpeg', '.webp', '.svg', '.apng', '.avif']);
const ENTRY_KEYS = ['name', 'shortcode', 'short_code', 'url', 'src', 'imageUrl', 'image_url', 'alias_for', 'aliasFor'];

const help = `Import emojme output into blueChat.

Usage:
  node scripts/import-emojme.mjs --list <adminList.json> [--source <download-dir>] [--out <public/emoji>]

Example:
  emojme download --subdomain myteam --save
  node scripts/import-emojme.mjs \\
    --list build/myteam.adminList.json \\
    --source build/myteam \\
    --out public/emoji

--source is the folder containing the downloaded emoji images (emojme --save).
If omitted, the folder containing --list is used. Remote http(s) URLs are kept as-is.
`;

function parseArgs(argv) {
  const args = { out: path.resolve(process.cwd(), 'public/emoji') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(help);
      process.exit(0);
    }
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=', 2);
      args[key] = inline ?? argv[++i];
    }
  }
  return args;
}

const cleanName = (value) =>
  String(value ?? '')
    .replace(/^:+|:+$/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_+-]/g, '_');

const isRemote = (value) => /^(https?:|data:)/i.test(value);

function findCollection(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return null;

  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === 'object' && ENTRY_KEYS.some((key) => key in item))) {
      return value;
    }
    for (const item of value) {
      const found = findCollection(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const key of ['emojis', 'emoji', 'list', 'items', 'data']) {
    if (value[key]) {
      const found = findCollection(value[key], depth + 1);
      if (found) return found;
    }
  }

  const values = Object.values(value);
  if (values.length && values.every((item) => item && typeof item === 'object' && ENTRY_KEYS.some((key) => key in item))) {
    return Object.entries(value).map(([key, item]) => ({ name: key, ...item }));
  }
  return null;
}

function normalizeEntry(raw, key, index) {
  if (typeof raw === 'string') {
    return { name: cleanName(key || raw), url: raw, aliasFor: '' };
  }
  if (!raw || typeof raw !== 'object') return null;

  const name = cleanName(raw.name ?? raw.shortcode ?? raw.short_code ?? key ?? index);
  const url = raw.url ?? raw.src ?? raw.imageUrl ?? raw.image_url ?? '';
  const aliasFor = cleanName(raw.alias_for ?? raw.aliasFor);
  if (!name || (!url && !aliasFor)) return null;
  return { name, url: String(url), aliasFor };
}

async function indexImages(root) {
  const index = new Map();
  async function walk(dir, depth) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 4) await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;
      index.set(entry.name.toLowerCase(), full);
      index.set(path.basename(entry.name, ext).toLowerCase(), full);
    }
  }
  await walk(root, 0);
  return index;
}

async function fileExists(file) {
  try {
    const stat = await fs.stat(file);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function findLocalFile(entry, listDir, sourceDir, imageIndex) {
  const raw = entry.url ? decodeURIComponent(String(entry.url).split(/[?#]/, 1)[0]) : '';
  const basename = path.basename(raw).toLowerCase();
  const stem = basename ? path.basename(basename, path.extname(basename)).toLowerCase() : '';
  const keys = [basename, stem, entry.name].filter(Boolean);

  for (const key of keys) {
    const found = imageIndex.get(key);
    if (found) return found;
  }

  if (raw && !isRemote(raw)) {
    const candidates = path.isAbsolute(raw)
      ? [raw]
      : [path.resolve(listDir, raw), path.resolve(sourceDir, raw)];
    for (const candidate of candidates) {
      if (await fileExists(candidate)) return candidate;
    }
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.list) {
    console.error('Missing --list <adminList.json>. Run --help for usage.');
    process.exit(1);
  }

  const listPath = path.resolve(process.cwd(), args.list);
  const listDir = path.dirname(listPath);
  const sourceDir = path.resolve(process.cwd(), args.source || listDir);
  const outDir = path.resolve(process.cwd(), args.out);
  await fs.mkdir(outDir, { recursive: true });

  const data = JSON.parse(await fs.readFile(listPath, 'utf8'));
  const collection = findCollection(data);
  if (!collection) {
    console.error('Could not find an emoji list in that JSON file.');
    process.exit(1);
  }

  const entries = [];
  const seen = new Set();
  collection.forEach((raw, index) => {
    const entry = normalizeEntry(raw, raw && typeof raw === 'object' ? String(raw.name ?? raw.shortcode ?? index) : undefined, index);
    if (!entry || seen.has(entry.name)) return;
    seen.add(entry.name);
    entries.push(entry);
  });

  const imageIndex = await indexImages(sourceDir);
  const output = [];
  const byName = new Map();
  const warnings = [];

  const copyEntry = async (entry) => {
    if (!entry.url) return null;
    if (isRemote(entry.url)) return entry.url;

    const local = await findLocalFile(entry, listDir, sourceDir, imageIndex);
    if (!local) {
      warnings.push(`${entry.name}: could not find image for ${entry.url}`);
      return null;
    }
    const ext = path.extname(local).toLowerCase() || '.png';
    const file = `${entry.name}${ext}`;
    await fs.copyFile(local, path.join(outDir, file));
    return `/emoji/${file}`;
  };

  const regular = entries.filter((entry) => !entry.aliasFor);
  for (const entry of regular) {
    const url = await copyEntry(entry);
    if (!url) continue;
    const item = { name: entry.name, url };
    output.push(item);
    byName.set(entry.name, { ...entry, outputUrl: url });
  }

  const resolveAlias = (entry, visited = new Set()) => {
    if (!entry || visited.has(entry.name)) return null;
    visited.add(entry.name);
    const target = byName.get(entry.aliasFor);
    if (target?.outputUrl) return target;
    if (target?.aliasFor) return resolveAlias(target, visited);
    return null;
  };

  for (const entry of entries.filter((item) => item.aliasFor)) {
    const target = resolveAlias(entry);
    if (target) {
      output.push({ name: entry.name, url: target.outputUrl, aliasFor: target.name });
      continue;
    }
    const url = await copyEntry(entry);
    if (url) output.push({ name: entry.name, url, aliasFor: entry.aliasFor });
    else warnings.push(`${entry.name}: alias target "${entry.aliasFor}" was not imported`);
  }

  output.sort((a, b) => a.name.localeCompare(b.name));
  const manifestPath = path.join(outDir, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify({ version: 1, emojis: output }, null, 2)}\n`, 'utf8');

  console.log(`Imported ${output.length} emoji into ${manifestPath}`);
  if (warnings.length) {
    console.log(`Skipped ${warnings.length} entries:`);
    warnings.slice(0, 20).forEach((warning) => console.log(`  - ${warning}`));
    if (warnings.length > 20) console.log(`  ... and ${warnings.length - 20} more`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
