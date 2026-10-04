import fs from 'node:fs';

const applyPath = '.github/scripts/apply-upload-cover-r2-v95.mjs';
let source = fs.readFileSync(applyPath, 'utf8');

// The generated TypeScript test contains regular-expression literals. Avoid a
// literal slash in the R2 path assertion so the test parser never mistakes it
// for the end of the regex.
const lines = source.split('\n');
let fixedPathAssertion = false;
source = lines.map(line => {
  if (line.includes('assert.doesNotMatch(policy') && line.includes('正在讀取 R2 cover')) {
    fixedPathAssertion = true;
    return "  assert.equal(policy.includes('正在讀取 R2 cover/ 圖庫…'), false);";
  }
  return line;
}).join('\n');
if (!fixedPathAssertion) throw new Error('missing R2 cover test assertion');

// Keep the earlier text/content regex safe as well. Depending on which runner
// version checked out the branch, this replacement may or may not still be needed.
const from = String.raw`text\/content`;
const to = String.raw`text\\/content`;
if (source.includes(from)) source = source.replace(from, to);

fs.writeFileSync(applyPath, source);
await import('./apply-upload-cover-r2-v95.mjs?fixed=2');

// Remove every one-shot helper from the final branch after verification input
// files have been generated successfully.
fs.rmSync('.github/scripts/fix-upload-cover-test-v95.mjs', { force: true });
fs.rmSync('.github/workflows/fix-upload-cover-test-v95.yml', { force: true });
