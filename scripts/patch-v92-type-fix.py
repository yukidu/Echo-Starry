from pathlib import Path

path = Path('src/App.tsx')
text = path.read_text()
old = """        getRequiredRankIndex: getRequiredRankSortIndex,
        getUploadTimestamp,
        getUploadSequence,
"""
new = """        getRequiredRankIndex: getRequiredRankSortIndex,
        getUploadTimestamp: track => getUploadTimestamp(track.uploadDate),
        getUploadSequence,
"""
if old not in text:
    raise SystemExit('default home ordering adapter not found')
path.write_text(text.replace(old, new, 1))
