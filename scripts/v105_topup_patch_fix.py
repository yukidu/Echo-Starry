from pathlib import Path
p = Path('scripts/v105_topup_patch.py')
text = p.read_text()
old = "db.sqlite.exec(`CREATE TABLE sticker_settings (key TEXT PRIMARY KEY,valueUnits INTEGER NOT NULL,updatedAt INTEGER NOT NULL,updatedBy TEXT);\n    INSERT INTO sticker_settings VALUES"
new = "db.sqlite.exec(`INSERT OR REPLACE INTO sticker_settings VALUES"
assert text.count(old) == 1, text.count(old)
p.write_text(text.replace(old, new, 1))
