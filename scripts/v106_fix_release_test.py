from pathlib import Path
p=Path('tests/releaseIntegrity.test.ts')
text=p.read_text()
text=text.replace("test('v104 is the single current PWA cache version'", "test('v106 is the single current PWA cache version'", 1)
text=text.replace("/const CACHE_NAME = 'echostars-shell-v104'/", "/const CACHE_NAME = 'echostars-shell-v106'/", 1)
p.write_text(text)
