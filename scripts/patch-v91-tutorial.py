from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"{path}: target text not found: {old[:100]}")
    p.write_text(text.replace(old, new, 1))


# Keep the homepage tutorial copy at its caller source.
replace_once(
    'src/App.tsx',
    "            text: '按此回首頁'",
    "            text: '回首頁'"
)
replace_once(
    'src/App.tsx',
    "            text: '按此註冊會員，可紀錄學習進度，跨裝置播放進度記憶，更多神秘有趣功能等你發現！'",
    "            text: '註冊會員\\n才有完整功能\\n\\n記憶播放進度\\n生命靈數分析\\n累積星幣點數\\n收藏我的最愛\\n超多有趣功能等你發現'"
)
replace_once(
    'src/App.tsx',
    "            text: '按照片可播放或暫停'",
    "            text: '按照片播放/暫停'"
)

# Make the membership callout tall enough for the requested feature list.
replace_once(
    'src/components/TutorialSpotlight.tsx',
    "    if (key === 'visitor') return isPhone ? 190 : isTablet ? 238 : 286;",
    "    if (key === 'visitor') return isPhone ? 226 : isTablet ? 250 : 286;"
)
replace_once(
    'src/components/TutorialSpotlight.tsx',
    "    if (key === 'visitor') return isPhone ? 94 : isTablet ? 82 : 78;",
    "    if (key === 'visitor') return isPhone ? 176 : isTablet ? 160 : 150;"
)

old_control = """  let controlTop = isPhone
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
new_control = """  let controlTop = viewport.height / 2 - controlHeight / 2;

  // On phones the shared control follows the photo instruction instead of
  // sticking to the bottom of the viewport. Resize/orientation updates above
  // recalculate both positions together whenever the visible height changes.
  if (isPhone) {
    const photo = positions.find(item => item.target.key === 'photo');
    if (photo) {
      const belowPhotoCallout = photo.position.top + photo.position.height + 16;
      const abovePhotoCallout = photo.position.top - controlHeight - 16;
      const roomBelow = belowPhotoCallout + controlHeight <= viewport.height - 12;
      controlTop = clamp(
        roomBelow ? belowPhotoCallout : abovePhotoCallout,
        12,
        viewport.height - controlHeight - 12
      );
    } else {
      controlTop = clamp(
        viewport.height * 0.56,
        12,
        viewport.height - controlHeight - 12
      );
    }
  }
"""
replace_once('src/components/TutorialSpotlight.tsx', old_control, new_control)
replace_once(
    'src/components/TutorialSpotlight.tsx',
    "              whiteSpace: 'normal',",
    "              whiteSpace: 'pre-line',"
)
replace_once(
    'src/components/TutorialSpotlight.tsx',
    '>打勾不再提醒</span>',
    '>打勾不再顯示新手教學</span>'
)

# Add regression coverage for copy and responsive positioning.
test = """import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const spotlight = readFileSync(new URL('../src/components/TutorialSpotlight.tsx', import.meta.url), 'utf8');

test('homepage tutorial uses the requested concise copy and member feature list', () => {
  assert.match(app, /text: '回首頁'/);
  assert.match(app, /text: '按照片播放\\/暫停'/);
  assert.match(app, /註冊會員\\\\n才有完整功能\\\\n\\\\n記憶播放進度\\\\n生命靈數分析\\\\n累積星幣點數\\\\n收藏我的最愛\\\\n超多有趣功能等你發現/);
  assert.doesNotMatch(app, /按此回首頁/);
  assert.doesNotMatch(app, /按照片可播放或暫停/);
  assert.doesNotMatch(app, /按此註冊會員/);
  assert.match(spotlight, /打勾不再顯示新手教學/);
  assert.doesNotMatch(spotlight, /打勾不再提醒/);
});

test('phone tutorial control stays near the photo callout and follows viewport height changes', () => {
  assert.match(spotlight, /belowPhotoCallout = photo\\.position\\.top \+ photo\\.position\\.height \+ 16/);
  assert.match(spotlight, /roomBelow = belowPhotoCallout \+ controlHeight <= viewport\\.height - 12/);
  assert.match(spotlight, /roomBelow \? belowPhotoCallout : abovePhotoCallout/);
  assert.match(spotlight, /window\\.addEventListener\('resize', update\)/);
  assert.match(spotlight, /window\\.addEventListener\('orientationchange', update\)/);
  assert.match(spotlight, /whiteSpace: 'pre-line'/);
  assert.match(spotlight, /key === 'visitor'[^\\n]*isPhone \? 176/);
});
"""
Path('tests/tutorialSpotlight.test.ts').write_text(test)

# Release notes and PWA cache.
replace_once('public/sw.js', "echostars-shell-v90", "echostars-shell-v91")
replace_once(
    'tests/releaseIntegrity.test.ts',
    "test('v90 is the single current PWA cache version'",
    "test('v91 is the single current PWA cache version'"
)
replace_once('tests/releaseIntegrity.test.ts', "echostars-shell-v90", "echostars-shell-v91")
replace_once(
    'src/changelogReleaseNotes.ts',
    "    '心得回覆顯示再精簡：日期時間字體再縮小；按下回覆不再自動塞入對方姓名或 @ 標記，送出後也不再顯示「回覆 @某某」前綴。舊留言中由系統自動加上的開頭 @ 對象會隱藏，只有使用者自己手動輸入的 @ 標記才會照原文顯示。',",
    "    '心得回覆顯示再精簡：日期時間字體再縮小；按下回覆不再自動塞入對方姓名或 @ 標記，送出後也不再顯示「回覆 @某某」前綴。舊留言中由系統自動加上的開頭 @ 對象會隱藏，只有使用者自己手動輸入的 @ 標記才會照原文顯示。',\\n    '首頁新手教學再整理：回首頁與照片播放提示改成更精簡文字；會員說明改為完整功能清單；「不再提醒」改為「不再顯示新手教學」，勾選區與「知道了」按鈕會固定靠近照片播放提示，並隨螢幕高度與旋轉方向自動調整位置。',"
)
