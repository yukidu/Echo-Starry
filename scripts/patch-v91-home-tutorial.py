from pathlib import Path
import re


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{path}: target not found: {old[:80]}')
    p.write_text(text.replace(old, new, 1))


# Home tutorial copy with explicit line breaks.
app = Path('src/App.tsx')
text = app.read_text()
replacements = [
    ("text: '按此回首頁'", "text: '回首頁'"),
    (
        "text: '按此註冊會員，可紀錄學習進度，跨裝置播放進度記憶，更多神秘有趣功能等你發現！'",
        "text: '註冊會員\\n才有完整功能\\n\\n記憶播放進度\\n生命靈數分析\\n累積星幣點數\\n收藏我的最愛\\n超多有趣功能等你發現'"
    ),
    ("text: '按照片可播放或暫停'", "text: '按照片\\n播放/暫停'"),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'src/App.tsx: target not found: {old}')
    text = text.replace(old, new, 1)
app.write_text(text)


spot = Path('src/components/TutorialSpotlight.tsx')
text = spot.read_text()

text = text.replace(
    "if (key === 'visitor') return isPhone ? 94 : isTablet ? 82 : 78;",
    "if (key === 'visitor') return isPhone ? 166 : isTablet ? 156 : 150;",
    1
)

old_control = r"""  const controlWidth = Math.min(isPhone ? 278 : 286, viewport.width - 24);
  const controlHeight = isPhone ? 134 : 124;

  let controlTop = isPhone
    ? viewport.height - controlHeight - 12
    : viewport.height / 2 - controlHeight / 2;

  // On small phones the shared control must not cover the first photo or its callout.
  if (isPhone) {
    const photo = positions.find(item => item.target.key === 'photo');
    if (photo) {
      const avoid = {
        left: Math.min(photo.rect.left, photo.position.left) - 8,
        top: Math.min(photo.rect.top, photo.position.top) - 8,
        right: Math.max(photo.rect.right, photo.position.left + photo.position.width) + 8,
        bottom: Math.max(photo.rect.bottom, photo.position.top + photo.position.height) + 8
      };
      const controlBox = {
        left: viewport.width / 2 - controlWidth / 2,
        top: controlTop,
        right: viewport.width / 2 + controlWidth / 2,
        bottom: controlTop + controlHeight
      };

      if (overlaps(controlBox, avoid, 6)) {
        controlTop = clamp(
          avoid.top - controlHeight - 14,
          12,
          viewport.height - controlHeight - 12
        );
      }
    }
  }
"""
new_control = r"""  const controlWidth = Math.min(isPhone ? 306 : 318, viewport.width - 24);
  const controlHeight = isPhone ? 134 : 124;

  // Keep the opt-out control physically attached to the photo instruction instead of
  // pinning it to the bottom of the viewport. Because the photo callout is recalculated
  // on resize/orientation/scroll, this control follows it on different screen heights.
  const photoCallout = positions.find(item => item.target.key === 'photo');
  let controlTop = isPhone
    ? viewport.height - controlHeight - 12
    : viewport.height / 2 - controlHeight / 2;

  if (photoCallout) {
    const gap = isPhone ? 12 : 16;
    const belowTop = photoCallout.position.top + photoCallout.position.height + gap;
    const aboveTop = photoCallout.position.top - controlHeight - gap;
    const fitsBelow = belowTop + controlHeight <= viewport.height - 12;
    controlTop = clamp(
      fitsBelow ? belowTop : aboveTop,
      12,
      viewport.height - controlHeight - 12
    );
  }
"""
if old_control not in text:
    raise SystemExit('TutorialSpotlight.tsx: control positioning block not found')
text = text.replace(old_control, new_control, 1)

if "whiteSpace: 'normal'" not in text:
    raise SystemExit('TutorialSpotlight.tsx: whiteSpace target not found')
text = text.replace("whiteSpace: 'normal'", "whiteSpace: 'pre-line'", 1)

if '>打勾不再提醒</span>' not in text:
    raise SystemExit('TutorialSpotlight.tsx: checkbox copy target not found')
text = text.replace('>打勾不再提醒</span>', '>打勾不再顯示新手教學</span>', 1)
spot.write_text(text)

# PWA release cache.
replace_once('public/sw.js', "echostars-shell-v90", "echostars-shell-v91")
replace_once('tests/releaseIntegrity.test.ts', "test('v90 is the single current PWA cache version'", "test('v91 is the single current PWA cache version'")
replace_once('tests/releaseIntegrity.test.ts', "echostars-shell-v90", "echostars-shell-v91")

# Plain-language changelog.
replace_once(
    'src/changelogReleaseNotes.ts',
    "    '心得回覆顯示再精簡：日期時間字體再縮小；按下回覆不再自動塞入對方姓名或 @ 標記，送出後也不再顯示「回覆 @某某」前綴。舊留言中由系統自動加上的開頭 @ 對象會隱藏，只有使用者自己手動輸入的 @ 標記才會照原文顯示。',",
    "    '心得回覆顯示再精簡：日期時間字體再縮小；按下回覆不再自動塞入對方姓名或 @ 標記，送出後也不再顯示「回覆 @某某」前綴。舊留言中由系統自動加上的開頭 @ 對象會隱藏，只有使用者自己手動輸入的 @ 標記才會照原文顯示。',\n    '首頁新手教學文字與位置整理：回首頁與照片播放提示改成更精簡文字；會員提示改為分行列出完整功能；「不再顯示新手教學」勾選區改為跟著照片提示框移動，手機高度或方向改變時也會一起重新定位。',"
)

# Focused regression test for copy and responsive positioning.
Path('tests/homeTutorialSpotlight.test.ts').write_text(r"""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const spotlight = readFileSync(new URL('../src/components/TutorialSpotlight.tsx', import.meta.url), 'utf8');

test('home tutorial uses the requested concise copy and explicit line breaks', () => {
  assert.match(app, /text: '回首頁'/);
  assert.match(app, /text: '按照片\\n播放\/暫停'/);
  assert.match(app, /註冊會員\\n才有完整功能\\n\\n記憶播放進度\\n生命靈數分析\\n累積星幣點數\\n收藏我的最愛\\n超多有趣功能等你發現/);
  assert.match(spotlight, /whiteSpace: 'pre-line'/);
  assert.match(spotlight, /打勾不再顯示新手教學/);
});

test('tutorial opt-out control follows the photo callout on viewport changes', () => {
  assert.match(spotlight, /const photoCallout = positions\.find\(item => item\.target\.key === 'photo'\)/);
  assert.match(spotlight, /const belowTop = photoCallout\.position\.top \+ photoCallout\.position\.height \+ gap/);
  assert.match(spotlight, /const aboveTop = photoCallout\.position\.top - controlHeight - gap/);
  assert.match(spotlight, /fitsBelow \? belowTop : aboveTop/);
  assert.match(spotlight, /window\.addEventListener\('resize', update\)/);
  assert.match(spotlight, /window\.addEventListener\('orientationchange', update\)/);
});
""")
