import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const badge = readFileSync(new URL('../src/utils/speakerRankBadge.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/components/DetailView.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v190RankBadge.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v190 maps every R2 Pin-Level medal filename to its exact speaker rank', () => {
  const required = [
    ['銅章', '01銅章.png'], ['銀章', '02銀章.png'], ['金章', '03金章.png'], ['白金', '04白金.png'],
    ['紅寶石', '05紅寶石.png'], ['創辦人白金', '06創辦人白金.png'], ['創辦人紅寶石', '07創辦人紅寶石.png'],
    ['明珠', '08明珠.png'], ['藍寶石', '09藍寶石.png'], ['創辦人藍寶石', '10創辦人藍寶石.png'],
    ['翡翠', '11翡翠.png'], ['創辦人翡翠', '12創辦人翡翠.png'], ['鑽石', '13鑽石.png'],
    ['創辦人鑽石', '14創辦人鑽石.png'], ['執行專才鑽石', '15 EDC.png'], ['創辦人執行專才鑽石', '16創辦人EDC.png'],
    ['雙鑽石', '17雙鑽石.png'], ['創辦人雙鑽石', '18創辦人雙鑽石.png'], ['參鑽石', '19參鑽石.png'],
    ['創辦人參鑽石', '20創辦人參鑽石.png'], ['皇冠', '21皇冠.png'], ['創辦人皇冠', '22創辦人皇冠.png'],
    ['皇冠大使', '23皇冠大使.png'], ['創辦人皇冠大使', '24創辦人皇冠大使.png']
  ];
  for (const [rank, file] of required) {
    assert.match(badge, new RegExp(`'${rank}': '${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  assert.match(badge, /Pin-Level\/\$\{fileName\}/);
  assert.match(badge, /api\/r2\/file/);
});

test('v190 detail card shows a clickable medal to the right of the cover with sparkle animation', () => {
  assert.match(detail, /const rankBadge = speakerRankBadge\(track\.speakerRank/);
  assert.match(detail, /left: 'calc\(100% \+ 0\.55rem\)'/);
  assert.match(detail, /onSelectSpeakerRank\?\.\(rankBadge\.rank\)/);
  assert.match(detail, /v190-rank-badge-sparkle--one/);
  assert.match(detail, /v190-rank-badge-sparkle--two/);
  assert.match(detail, /v190-rank-badge-sparkle--three/);
  assert.match(css, /@keyframes v190-rank-badge-bob/);
  assert.match(css, /@keyframes v190-rank-badge-sparkle/);
});

test('v190 medal click returns home and applies an exact medal-rank filter', () => {
  assert.match(app, /selectedBadgeSpeakerRank/);
  assert.match(app, /normalizeSpeakerRankForBadge\(t\.speakerRank \|\| ''\) !== selectedBadgeSpeakerRank/);
  assert.match(app, /onSelectSpeakerRank=\{rank =>/);
  assert.match(app, /setSelectedCategory\('全部'\)/);
  assert.match(app, /setSelectedSpeakerRank\('全部'\)/);
  assert.match(app, /setSelectedKeywords\(\[\]\)/);
  assert.match(app, /setSearchQuery\(''\)/);
  assert.match(app, /setCurrentTab\('home'\)/);
  assert.match(app, /獎章篩選：\{selectedBadgeSpeakerRank\}/);
});

test('v190 release note is loaded and no DOM MutationObserver is introduced for the medal feature', () => {
  assert.match(index, /\/src\/v190ReleaseNote\.ts/);
  assert.doesNotMatch(badge, /MutationObserver/);
  assert.doesNotMatch(css, /MutationObserver/);
});
