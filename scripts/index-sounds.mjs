#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.webm', '.flac', '.aiff', '.opus']);
const OUT_NAME = 'index.json';

const friendly = (value) =>
  String(value ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/\s*\(ID\s*\d+\)\s*/gi, ' ')
    .replace(/_bigsoundbank\.com/gi, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

async function walk(dir, rel = '') {
  const found = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const relative = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      found.push(...(await walk(full, relative)));
      continue;
    }
    if (!entry.isFile() || entry.name === OUT_NAME) continue;
    if (!AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    found.push({
      path: relative.split(path.sep).join('/'),
      name: friendly(entry.name),
      group: friendly(rel || 'General'),
    });
  }
  return found;
}

const root = path.resolve(process.cwd(), 'public/sounds');
const sounds = (await walk(root)).sort(
  (a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name),
);
const outFile = path.join(root, OUT_NAME);
await fs.writeFile(outFile, `${JSON.stringify({ version: 1, sounds }, null, 2)}\n`, 'utf8');
console.log(`Indexed ${sounds.length} sounds in ${outFile}`);
