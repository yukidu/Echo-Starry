from pathlib import Path

notifications_path = Path('src/components/NotificationsView.tsx')
text = notifications_path.read_text()
old = """        if (isSelf) return false;\n        return comment.content.includes('@') || comment.content.includes('＠');\n"""
new = """        if (isSelf) return false;\n        const lower = comment.content.toLowerCase();\n        const isDirectMention = myName\n          ? lower.includes(`@${myName}`) || lower.includes(`＠${myName}`) || comment.replyToAuthor?.toLowerCase().trim() === myName\n          : false;\n        return isDirectMention;\n"""
if text.count(old) != 1:
    raise SystemExit(f'notification scope: expected 1 old filter, found {text.count(old)}')
text = text.replace(old, new, 1)
notifications_path.write_text(text)

test_path = Path('tests/v116NotificationTabs.test.ts')
test = test_path.read_text()
needle = "  assert.equal(notifications.includes('border-b-2'), true);\n"
replacement = needle + "  assert.equal(notifications.includes('return isDirectMention;'), true);\n  assert.equal(notifications.includes(\"return comment.content.includes('@') || comment.content.includes('＠');\"), false);\n"
if test.count(needle) != 1:
    raise SystemExit(f'notification regression insertion: expected 1 match, found {test.count(needle)}')
test_path.write_text(test.replace(needle, replacement, 1))
