from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"{path}: target text not found")
    p.write_text(text.replace(old, new, 1))


comments_path = Path('src/components/CommentsSection.tsx')
comments = comments_path.read_text()

anchor = "interface CommentsSectionProps {\n"
helper = """const stripLegacyAutoReplyMention = (content: string, replyToAuthor?: string) => {\n  const value = typeof content === 'string' ? content : '';\n  const author = replyToAuthor?.trim();\n  if (!author) return value;\n  for (const prefix of [`@${author}`, `＠${author}`]) {\n    if (!value.startsWith(prefix)) continue;\n    const nextChar = value.slice(prefix.length, prefix.length + 1);\n    if (nextChar && !/\\s/.test(nextChar)) continue;\n    return value.slice(prefix.length).trimStart();\n  }\n  return value;\n};\n\n"""
if helper not in comments:
    if anchor not in comments:
        raise SystemExit('CommentsSection.tsx: interface anchor not found')
    comments = comments.replace(anchor, helper + anchor, 1)

replacements = [
    (
        "      await onAddComment(inputText.trim(), replyingTo?.id, replyingTo?.authorName);",
        "      await onAddComment(inputText.trim(), replyingTo?.id);"
    ),
    (
        "              <span className=\"flex items-center gap-1.5\"><Reply className=\"w-3.5 h-3.5\" /><span>回覆 @{replyingTo.authorName}</span></span>",
        "              <span className=\"flex items-center gap-1.5\"><Reply className=\"w-3.5 h-3.5\" /><span>正在回覆這則留言</span></span>"
    ),
    (
        "          <textarea ref={textareaRef} value={inputText} onChange={handleTextareaChange} maxLength={2000} rows={3} placeholder={replyingTo ? `回覆 @${replyingTo.authorName}...` : '寫下您的心得收穫...'} className=\"w-full bg-transparent resize-none outline-hidden text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder:text-slate-400\" />",
        "          <textarea ref={textareaRef} value={inputText} onChange={handleTextareaChange} maxLength={2000} rows={3} placeholder={replyingTo ? '寫下回覆內容...' : '寫下您的心得收穫...'} className=\"w-full bg-transparent resize-none outline-hidden text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder:text-slate-400\" />"
    ),
    (
        "                    <span className=\"text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-[1.15] text-center\">{timestampLines.map((line, index) => <span key={`${c.id}-time-${index}`} className=\"block whitespace-nowrap\">{line}</span>)}</span>",
        "                    <span className=\"text-[8px] text-slate-400 dark:text-slate-500 font-mono leading-[1.05] text-center\">{timestampLines.map((line, index) => <span key={`${c.id}-time-${index}`} className=\"block whitespace-nowrap\">{line}</span>)}</span>"
    ),
    (
        "                        <button type=\"button\" onClick={() => { setReplyingTo(c); setInputText(`@${displayAuthorName} `); textareaRef.current?.focus(); }} className=\"flex items-center gap-0.5 text-base leading-none text-slate-400 hover:text-[var(--color-primary,#c06c84)] px-0.5 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap\" title=\"回覆此心得\"><Reply className=\"w-5 h-5\" /><span>回覆</span></button>",
        "                        <button type=\"button\" onClick={() => { setReplyingTo(c); textareaRef.current?.focus(); }} className=\"flex items-center gap-0.5 text-base leading-none text-slate-400 hover:text-[var(--color-primary,#c06c84)] px-0.5 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap\" title=\"回覆此心得\"><Reply className=\"w-5 h-5\" /><span>回覆</span></button>"
    ),
    (
        "            const timestampLines = formatCommentTimestampDisplay(c);",
        "            const timestampLines = formatCommentTimestampDisplay(c);\n            const displayContent = stripLegacyAutoReplyMention(c.content, c.replyToAuthor);"
    ),
    (
        "                        {c.replyToAuthor && <span className=\"text-[11px] text-[var(--color-primary,#c06c84)] font-bold mr-1.5\">回覆 @{c.replyToAuthor}：</span>}\n                        {renderFormattedContent(c.content)}",
        "                        {renderFormattedContent(displayContent)}"
    ),
]

for old, new in replacements:
    if old not in comments:
        raise SystemExit(f'CommentsSection.tsx: replacement target not found: {old[:80]}')
    comments = comments.replace(old, new, 1)

comments_path.write_text(comments)

# Strengthen regression coverage for the requested reply display behavior.
test_path = Path('tests/commentTimestamp.test.ts')
test_text = test_path.read_text()
needle = """  assert.match(comments, /className=\"text-base[^\\n]*whitespace-pre-wrap mt-1\\.5 break-words\"/);\n  assert.doesNotMatch(comments, /pl-16 whitespace-pre-wrap/);\n});\n"""
replacement = """  assert.match(comments, /className=\"text-base[^\\n]*whitespace-pre-wrap mt-1\\.5 break-words\"/);\n  assert.match(comments, /text-\\[8px\\][^\\n]*font-mono leading-\\[1\\.05\\]/);\n  assert.match(comments, /stripLegacyAutoReplyMention/);\n  assert.match(comments, /await onAddComment\\(inputText\\.trim\\(\\), replyingTo\\?\\.id\\);/);\n  assert.match(comments, /renderFormattedContent\\(displayContent\\)/);\n  assert.doesNotMatch(comments, /setInputText\\(`@\\$\\{displayAuthorName\\} `\\)/);\n  assert.doesNotMatch(comments, /回覆 @\\$\\{replyingTo\\.authorName\\}/);\n  assert.doesNotMatch(comments, /c\\.replyToAuthor && <span/);\n  assert.doesNotMatch(comments, /pl-16 whitespace-pre-wrap/);\n});\n"""
if needle not in test_text:
    raise SystemExit('tests/commentTimestamp.test.ts: compact layout assertion block not found')
test_path.write_text(test_text.replace(needle, replacement, 1))

replace_once('public/sw.js', "echostars-shell-v89", "echostars-shell-v90")
replace_once('tests/releaseIntegrity.test.ts', "test('v89 is the single current PWA cache version'", "test('v90 is the single current PWA cache version'")
replace_once('tests/releaseIntegrity.test.ts', "echostars-shell-v89", "echostars-shell-v90")
replace_once(
    'src/changelogReleaseNotes.ts',
    "    '心得留言排列再壓縮：留言本文直接緊接在姓名與獎銜下方，不再被左側頭像時間撐出大片空白；愛心與回覆固定和獎銜同一行靠右，回覆箭頭與文字同步放大到心得本文等級。',",
    "    '心得留言排列再壓縮：留言本文直接緊接在姓名與獎銜下方，不再被左側頭像時間撐出大片空白；愛心與回覆固定和獎銜同一行靠右，回覆箭頭與文字同步放大到心得本文等級。',\n    '心得回覆顯示再精簡：日期時間字體再縮小；按下回覆不再自動塞入對方姓名或 @ 標記，送出後也不再顯示「回覆 @某某」前綴。舊留言中由系統自動加上的開頭 @ 對象會隱藏，只有使用者自己手動輸入的 @ 標記才會照原文顯示。',"
)
