import fs from 'node:fs';

const applyPath = '.github/scripts/apply-upload-cover-r2-v95.mjs';
let source = fs.readFileSync(applyPath, 'utf8');
const from = String.raw`text\/content`;
const to = String.raw`text\\/content`;
if (!source.includes(from)) throw new Error('missing test escape pattern');
source = source.replace(from, to);
fs.writeFileSync(applyPath, source);

await import('./apply-upload-cover-r2-v95.mjs?fixed=1');

fs.rmSync('.github/scripts/fix-upload-cover-test-v95.mjs', { force: true });
fs.rmSync('.github/workflows/fix-upload-cover-test-v95.yml', { force: true });
