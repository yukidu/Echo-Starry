from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"{path}: target text not found")
    p.write_text(text.replace(old, new, 1))


p = Path('src/components/CommentsSection.tsx')
text = p.read_text()
start_marker = "            return (\n              <div id={`comment-${c.id}`} key={c.id} className={`space-y-1 ${isReply ? 'pt-2' : 'pt-3 first:pt-0'}`}>"
end_marker = "              </div>\n            );"
start = text.index(start_marker)
end = text.index(end_marker, start) + len(end_marker)
new_block = r'''            return (
              <div id={`comment-${c.id}`} key={c.id} className={`${isReply ? 'pt-2' : 'pt-3 first:pt-0'}`}>
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2">
                  <div
                    onClick={isClickable ? () => handleAuthorClick(c) : undefined}
                    className={`w-14 shrink-0 flex flex-col items-center gap-1 ${isClickable ? 'cursor-pointer hover:opacity-85 transition-opacity' : 'cursor-default pointer-events-none'}`}
                    title={isClickable ? `點擊查看【${displayAuthorName}】會員個人檔案` : undefined}
                  >
                    {isAvatarUrl ? <img src={displayAuthorAvatar} alt={displayAuthorName} className="w-14 h-14 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" /> : <span className="w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0">{displayAuthorAvatar || '👤'}</span>}
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono leading-[1.15] text-center">{timestampLines.map((line, index) => <span key={`${c.id}-time-${index}`} className="block whitespace-nowrap">{line}</span>)}</span>
                  </div>

                  <div className="min-w-0">
                    <div
                      onClick={isClickable ? () => handleAuthorClick(c) : undefined}
                      className={`${isClickable ? 'cursor-pointer hover:opacity-85 transition-opacity' : 'cursor-default pointer-events-none'} min-w-0`}
                      title={isClickable ? `點擊查看【${displayAuthorName}】會員個人檔案` : undefined}
                    >
                      {c.isAdmin || displayAuthorBadge === '貢獻者' ? <span className="rainbow-admin-text font-bold text-base leading-tight break-words">{displayAuthorName}</span> : isClickable ? <span className="font-bold text-slate-800 dark:text-slate-100 text-base underline decoration-dotted underline-offset-2 hover:text-rose-600 transition-colors leading-tight break-words">{displayAuthorName}</span> : <span className="font-bold text-slate-700 dark:text-slate-300 text-base select-none leading-tight break-words">{displayAuthorName}</span>}
                    </div>

                    <div className="mt-1 flex items-center gap-1 min-w-0 flex-nowrap">
                      <div className="flex items-center gap-1 min-w-0 shrink">
                        {isVisitor && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] border border-[var(--theme-border-subtle,#f1e7ea)] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-medium select-none leading-tight whitespace-nowrap shrink-0">訪客</span>}
                        {showBadge && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] border border-[var(--theme-border-subtle,#f1e7ea)] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-medium whitespace-nowrap shrink-0 leading-tight">{displayAuthorBadge}</span>}
                      </div>

                      <div className="ml-auto flex items-center justify-end gap-0.5 shrink-0">
                        <button type="button" onClick={() => handleLikeComment(c)} className={`flex items-center gap-0.5 text-sm px-0.5 py-0.5 rounded-lg transition-colors cursor-pointer ${userLiked ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/60 font-bold' : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`} title={userLiked ? '取消讚' : '按讚這則心得'}>
                          <Heart className={`w-5 h-5 ${userLiked ? 'fill-rose-500 text-rose-500' : ''}`} /><span>{userLikesCount > 0 ? userLikesCount : ''}</span>
                        </button>
                        <button type="button" onClick={() => { setReplyingTo(c); setInputText(`@${displayAuthorName} `); textareaRef.current?.focus(); }} className="flex items-center gap-0.5 text-base leading-none text-slate-400 hover:text-[var(--color-primary,#c06c84)] px-0.5 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap" title="回覆此心得"><Reply className="w-5 h-5" /><span>回覆</span></button>
                        {isAuthor && editingId !== c.id && <button onClick={() => handleStartEdit(c)} title="編輯心得" className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"><Edit3 className="w-4 h-4" /></button>}
                        {(isAuthor || isSuperAdminModerator || (isAdminModerator && isVisitor)) && editingId !== c.id && <button onClick={() => onDeleteComment(c.id)} title="刪除心得" className="p-0.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>

                    {editingId === c.id ? (
                      <div className="mt-1.5 space-y-1.5">
                        <textarea maxLength={2000} value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 text-sm text-slate-800 dark:text-slate-100 outline-hidden" rows={2} />
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><X className="w-3 h-3" /> 取消</button>
                          <button onClick={() => handleSaveEdit(c.id)} className="px-2.5 py-1 rounded-lg text-xs bg-rose-600 text-white flex items-center gap-1 shadow-2xs font-bold cursor-pointer"><Check className="w-3 h-3" /> 儲存修改</button>
                        </div>
                      </div>
                    ) : (
                      <CollapsibleCommentText
                        className="text-base text-slate-700 dark:text-slate-300 leading-snug whitespace-pre-wrap mt-1.5 break-words"
                        resetKey={`${c.id}:${c.content}`}
                      >
                        {c.replyToAuthor && <span className="text-[11px] text-[var(--color-primary,#c06c84)] font-bold mr-1.5">回覆 @{c.replyToAuthor}：</span>}
                        {renderFormattedContent(c.content)}
                      </CollapsibleCommentText>
                    )}
                  </div>
                </div>
              </div>
            );'''
p.write_text(text[:start] + new_block + text[end:])

# Update regression expectations for the new two-column comment layout.
p = Path('tests/commentTimestamp.test.ts')
text = p.read_text()
old_test = r'''test('comment time layout and actions follow the mobile presentation rules', () => {
  const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
  assert.match(comments, /formatCommentTimestampDisplay\(c\)/);
  assert.match(comments, /timestampLines\.map/);
  assert.match(comments, /Heart className=\{`w-5 h-5/);
  assert.match(comments, /flex items-center gap-0 shrink-0 pt-0\.5/);
});'''
new_test = r'''test('comment time, badge, actions and body follow the compact mobile layout', () => {
  const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
  assert.match(comments, /formatCommentTimestampDisplay\(c\)/);
  assert.match(comments, /timestampLines\.map/);
  assert.match(comments, /grid grid-cols-\[3\.5rem_minmax\(0,1fr\)\]/);
  assert.match(comments, /ml-auto flex items-center justify-end gap-0\.5 shrink-0/);
  assert.match(comments, /Heart className=\{`w-5 h-5/);
  assert.match(comments, /Reply className="w-5 h-5"/);
  assert.match(comments, /className="flex items-center gap-0\.5 text-base leading-none[^\n]*<Reply/);
  assert.match(comments, /className="text-base[^\n]*whitespace-pre-wrap mt-1\.5 break-words"/);
  assert.doesNotMatch(comments, /pl-16 whitespace-pre-wrap/);
});'''
if old_test not in text:
    raise SystemExit('tests/commentTimestamp.test.ts: old layout test not found')
p.write_text(text.replace(old_test, new_test, 1))

replace_once('public/sw.js', "echostars-shell-v88", "echostars-shell-v89")
replace_once('tests/releaseIntegrity.test.ts', "test('v88 is the single current PWA cache version'", "test('v89 is the single current PWA cache version'")
replace_once('tests/releaseIntegrity.test.ts', "echostars-shell-v88", "echostars-shell-v89")
replace_once(
    'src/changelogReleaseNotes.ts',
    "    '心得留言時間版面再調整：時間改成「年份／月日／時分」三行顯示；按讚與回覆操作靠得更近，按讚愛心同步放大，手機閱讀與操作更清楚。',",
    "    '心得留言時間版面再調整：時間改成「年份／月日／時分」三行顯示；按讚與回覆操作靠得更近，按讚愛心同步放大，手機閱讀與操作更清楚。',\n    '心得留言排列再壓縮：留言本文直接緊接在姓名與獎銜下方，不再被左側頭像時間撐出大片空白；愛心與回覆固定和獎銜同一行靠右，回覆箭頭與文字同步放大到心得本文等級。',"
)
