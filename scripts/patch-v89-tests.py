from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"{path}: target text not found")
    p.write_text(text.replace(old, new, 1))

replace_once(
    'tests/detailPageUx.test.ts',
    "test('comment composer and rows are compact and readable', () => { assert.doesNotMatch(comments, /送出心得/); assert.match(comments, /'送出'/); assert.match(comments, /w-14 h-14 rounded-full object-cover/); assert.match(comments, /min-h-14 min-w-0 flex flex-col justify-center/); assert.match(comments, /text-base text-slate-700[\\s\\S]*leading-snug pl-16/); });",
    "test('comment composer and rows are compact and readable', () => { assert.doesNotMatch(comments, /送出心得/); assert.match(comments, /'送出'/); assert.match(comments, /w-14 h-14 rounded-full object-cover/); assert.match(comments, /grid grid-cols-\\[3\\.5rem_minmax\\(0,1fr\\)\\]/); assert.match(comments, /text-base text-slate-700[^\\n]*leading-snug whitespace-pre-wrap mt-1\\.5/); assert.doesNotMatch(comments, /pl-16 whitespace-pre-wrap/); });"
)

replace_once(
    'tests/miniPlayerCommentLayout.test.ts',
    "test('comment identity layout keeps avatar, time, name and badge readable', () => { assert.match(comments, /w-14 shrink-0 flex flex-col items-center gap-1/); assert.match(comments, /w-14 h-14 rounded-full object-cover/); assert.match(comments, /formatCommentTimestampDisplay\\(c\\)/); assert.match(comments, /timestampLines\\.map/); assert.match(comments, /displayAuthorName[^\\n]*text-base|text-base[^\\n]*displayAuthorName/); assert.match(comments, /displayAuthorBadge[^\\n]*text-\\[10px\\]|text-\\[10px\\][^\\n]*displayAuthorBadge/); assert.match(comments, /pl-16 whitespace-pre-wrap/); });",
    "test('comment identity layout keeps avatar, time, name and badge readable', () => { assert.match(comments, /w-14 shrink-0 flex flex-col items-center gap-1/); assert.match(comments, /w-14 h-14 rounded-full object-cover/); assert.match(comments, /formatCommentTimestampDisplay\\(c\\)/); assert.match(comments, /timestampLines\\.map/); assert.match(comments, /displayAuthorName[^\\n]*text-base|text-base[^\\n]*displayAuthorName/); assert.match(comments, /displayAuthorBadge[^\\n]*text-\\[10px\\]|text-\\[10px\\][^\\n]*displayAuthorBadge/); assert.match(comments, /ml-auto flex items-center justify-end gap-0\\.5 shrink-0/); assert.doesNotMatch(comments, /pl-16 whitespace-pre-wrap/); });"
)
