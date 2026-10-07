from pathlib import Path
p=Path('src/changelogReleaseNotes.ts')
text=p.read_text()
old="""export const STICKER_LEADERBOARD_RELEASE_NOTES: ChangelogEntry = {
  version: 'v4.4',
  date: '2026-10-07',
  title: '貼紙排位賽與會員搜尋',
  added: ["""
new="""export const STICKER_LEADERBOARD_RELEASE_NOTES: ChangelogEntry = {
  version: 'v4.4',
  date: '2026/10/07',
  summary: '排行榜新增貼紙排位賽與會員基本資料關鍵字搜尋，快速比較貼紙現況並找到會員。',
  added: ["""
assert text.count(old)==1, text.count(old)
text=text.replace(old,new,1)
old2="""  modified: [
    '搜尋建議不主動顯示電話、生日、Email、直銷商編號等敏感值；已登入會員仍可用已知資料精確搜尋。'
  ]
};"""
new2="""  modified: [
    '搜尋建議不主動顯示電話、生日、Email、直銷商編號等敏感值；已登入會員仍可用已知資料精確搜尋。'
  ],
  removed: []
};"""
assert text.count(old2)==1, text.count(old2)
text=text.replace(old2,new2,1)
p.write_text(text)
