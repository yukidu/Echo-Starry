import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const ROOTS = ['src', 'public'];
const EXTRA_FILES = ['index.html'];
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.html']);
const NEEDLES = ['開燈/關燈', '開燈／關燈', '淺色／暗色切換'];
const matches = [];

async function scanFile(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return;
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const needle of NEEDLES) {
      if (!line.includes(needle)) continue;
      matches.push({
        file: relative(process.cwd(), path),
        line: index + 1,
        needle,
        excerpt: line.trim().slice(0, 500)
      });
    }
  });
}

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (TEXT_EXTENSIONS.has(extname(entry.name))) await scanFile(path);
  }
}

for (const root of ROOTS) await walk(root);
for (const file of EXTRA_FILES) await scanFile(file);

const report = {
  generatedAt: new Date().toISOString(),
  needles: NEEDLES,
  matches
};
await writeFile('/tmp/echostars-theme-source-scan.json', JSON.stringify(report, null, 2), 'utf8');
console.log(`Theme legacy source matches: ${matches.length}`);
for (const match of matches) {
  console.log(`${match.file}:${match.line} [${match.needle}] ${match.excerpt}`);
}
