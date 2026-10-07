from pathlib import Path

path = Path('src/components/NotificationsView.tsx')
text = path.read_text()
old = ") : mentionNotifications.map(message => {"
new = ") : mentionNotifications.map(m => {"
if text.count(old) != 1:
    raise SystemExit(f'expected one message map, found {text.count(old)}')
text = text.replace(old, new, 1)
start = text.index(new)
end = text.index("      {activeTab === 'pending'", start)
block = text[start:end].replace('message.', 'm.')
text = text[:start] + block + text[end:]
path.write_text(text)
