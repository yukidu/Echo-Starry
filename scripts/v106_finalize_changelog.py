from pathlib import Path
p=Path('src/changelogReleaseNotes.ts')
text=p.read_text()
old="""export const STICKER_LEADERBOARD_RELEASE_NOTES: ChangelogEntry = {
  version: 'v4.4',
  date: '2026/10/07',"""
new="""export const STICKER_LEADERBOARD_RELEASE_NOTES: ChangelogEntry = {
  version: 'v4.5',
  date: '2026/10/07',
  isLatest: true,"""
assert text.count(old)==1, text.count(old)
text=text.replace(old,new,1)
old2="export const PLATINUM_MULTIPLIER_RELEASE_NOTES: ChangelogEntry = {\n  version: 'v4.4', date: '2026/10/07', isLatest: true,"
new2="export const PLATINUM_MULTIPLIER_RELEASE_NOTES: ChangelogEntry = {\n  version: 'v4.4', date: '2026/10/07',"
assert text.count(old2)==1, text.count(old2)
text=text.replace(old2,new2,1)
old3="const RELEASE_NOTES = [PLATINUM_MULTIPLIER_RELEASE_NOTES, STICKER_GUIDE_RELEASE_NOTES, ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES];"
new3="const RELEASE_NOTES = [STICKER_LEADERBOARD_RELEASE_NOTES, PLATINUM_MULTIPLIER_RELEASE_NOTES, STICKER_GUIDE_RELEASE_NOTES, ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES];"
assert text.count(old3)==1, text.count(old3)
text=text.replace(old3,new3,1)
p.write_text(text)
