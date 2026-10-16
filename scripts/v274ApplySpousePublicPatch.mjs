import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function write(path,value){ fs.writeFileSync(path,value); }
function replaceOne(source, needle, replacement, label){
  const count=source.split(needle).length-1;
  if(count!==1) throw new Error(`${label}: expected 1 match, got ${count}`);
  return source.replace(needle,replacement);
}
function replaceSection(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker);
  const end=source.indexOf(endMarker,start);
  if(start<0||end<0) throw new Error(`${label}: section markers not found`);
  if(source.indexOf(startMarker,start+1)>=0) throw new Error(`${label}: duplicate start marker`);
  return source.slice(0,start)+replacement+source.slice(end);
}

// 1) Central member payload: attach the active spouse name to every member response.
{
  const path='worker/starryIdCentralRouter.ts';
  let s=read(path);
  s=replaceOne(s,
    "           (SELECT mr.legacyLabel FROM member_relationships mr WHERE mr.userId=u.id AND mr.relationType='diamond_upline' LIMIT 1),'') AS diamondUpline\n  FROM users u",
    "           (SELECT mr.legacyLabel FROM member_relationships mr WHERE mr.userId=u.id AND mr.relationType='diamond_upline' LIMIT 1),'') AS diamondUpline,\n  COALESCE((SELECT NULLIF(TRIM(sp.name),'') FROM spouse_links sl JOIN profiles sp ON sp.userId=CASE WHEN sl.userA=u.id THEN sl.userB ELSE sl.userA END WHERE sl.status='active' AND (sl.userA=u.id OR sl.userB=u.id) LIMIT 1),'') AS spouseName\n  FROM users u",
    'central memberSelect spouse');
  s=replaceOne(s,
    "    diamondUpline: row.diamondUpline || ''\n",
    "    diamondUpline: row.diamondUpline || '',\n    spouseName: row.spouseName || ''\n",
    'central publicMember spouse');
  write(path,s);
}

// 2) Logged-in member center: show spouse directly below the distributor/member number.
{
  const path='worker/starryIdMemberCenterPage.ts';
  let s=read(path);
  s=replaceOne(s,
    ".field-hint{font-size:11px;color:#7789a8;margin-top:5px}.saving",
    ".field-hint{font-size:11px;color:#7789a8;margin-top:5px}.spouse-link{font-size:12px;color:var(--accent);margin-top:7px;padding-right:72px}.saving",
    'member center spouse css');
  s=replaceOne(s,
    "card.append(l,v);\n        if(isOwnProfile())",
    "card.append(l,v); if(field==='amwayId'&&user.spouseName){ const spouse=document.createElement('div'); spouse.className='spouse-link'; spouse.textContent='夫妻綁定：'+user.spouseName; card.appendChild(spouse); }\n        if(isOwnProfile())",
    'member center spouse line');
  write(path,s);
}

// 3) Public card: cardNumber is also a valid direct URL and spouse is shown under the visible identifier.
{
  const path='worker/starryIdV211Router.ts';
  let s=read(path);
  s=replaceOne(s,
    "let card: any = await db.prepare('SELECT userId,slug,cardNumber FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first();\nif(!card && /^[0-9]+$/.test(slug))",
    "let card: any = await db.prepare('SELECT userId,slug,cardNumber FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first();\nif(!card) card = await db.prepare('SELECT userId,slug,cardNumber FROM public_cards WHERE cardNumber=? LIMIT 1').bind(slug).first();\nif(!card && /^[0-9]+$/.test(slug))",
    'public cardNumber direct lookup');
  s=replaceOne(s,
    "  data.spouse=partner?.name?'已與 '+text(partner.name)+' 綁定夫妻':'';\n",
    "  data.spouseName=text(partner?.name);\n  data.spouse=partner?.name?'已與 '+text(partner.name)+' 綁定夫妻':'';\n",
    'public spouse name');
  s=replaceOne(s,
    ",['diamondUpline','鑽石上線'],['spouse','夫妻關係']];",
    ",['diamondUpline','鑽石上線']];",
    'remove duplicate spouse row');
  s=replaceOne(s,
    ".value{font-size:16px;white-space:pre-wrap;overflow-wrap:anywhere}.login",
    ".value{font-size:16px;white-space:pre-wrap;overflow-wrap:anywhere}.spouse-link{font-size:12px;color:#93b8ff;margin-top:7px}.login",
    'public spouse css');
  s=replaceOne(s,
    "<div class=\"value\">${escapeHtml(data[key])}</div>",
    "<div class=\"value\">${escapeHtml(data[key])}${(key==='amwayId'||key==='cardNumber')&&data.spouseName?'<div class=\"spouse-link\">夫妻綁定：'+escapeHtml(data.spouseName)+'</div>':''}</div>",
    'public spouse under identifier');
  write(path,s);
}

// 4) Numeric distributor IDs shared by exactly two active spouses are valid public URLs.
{
  const path='worker/starryIdV212PublicCardBridge.ts';
  let s=read(path);
  const replacement=`async function findCanonicalActiveMember(db: any, amwayId: string) {
  const result: any = await db.prepare(\`SELECT u.id,p.amwayId
    FROM users u
    JOIN profiles p ON p.userId=u.id
    WHERE u.status='active' AND TRIM(COALESCE(p.amwayId,''))=?
    ORDER BY u.id
    LIMIT 3\`).bind(amwayId).all();
  const rows = result?.results || [];
  if (rows.length === 1 && text(rows[0].amwayId) === amwayId) return rows[0];
  if (rows.length !== 2 || rows.some((row: any) => text(row.amwayId) !== amwayId)) return null;

  const pair: any = await db.prepare(\`SELECT id FROM spouse_links
    WHERE status='active'
      AND ((userA=? AND userB=?) OR (userA=? AND userB=?))
    LIMIT 1\`).bind(rows[0].id,rows[1].id,rows[1].id,rows[0].id).first().catch(()=>null);
  if (!pair) return null;

  // A shared distributor number is intentionally one URL. Prefer whichever spouse
  // already owns that slug, otherwise keep a deterministic existing card owner.
  const existing: any = await db.prepare(\`SELECT userId FROM public_cards
    WHERE userId IN (?,?)
    ORDER BY CASE WHEN LOWER(slug)=LOWER(?) THEN 0 ELSE 1 END, seq, userId
    LIMIT 1\`).bind(rows[0].id,rows[1].id,amwayId).first().catch(()=>null);
  if (existing?.userId) {
    const chosen = rows.find((row: any) => text(row.id) === text(existing.userId));
    if (chosen) return chosen;
  }
  return rows[0];
}`;
  s=replaceSection(s,'async function findUniqueActiveMember','\n\nasync function materializeCard',replacement,'v212 canonical spouse member');
  s=s.replace('findUniqueActiveMember(env.STARRY_ID_DB, amwayId)','findCanonicalActiveMember(env.STARRY_ID_DB, amwayId)');
  if(!s.includes('findCanonicalActiveMember(env.STARRY_ID_DB, amwayId)')) throw new Error('v212 call rename failed');
  write(path,s);
}

// 5) Keep the original v212 regression aligned with the intentional spouse-pair behavior.
{
  const path='tests/starryIdV212PublicCardBridge.test.ts';
  let s=read(path);
  const start="test('legacy fallback only runs after a v211 404 and requires one active exact Amway member', () => {";
  const end="\n\ntest('first public Amway request assigns an n sequence and delegates rendering back to v211', () => {";
  const block=`test('legacy fallback only runs after a v211 404 and accepts one member or one active spouse pair', () => {
  assert.match(bridge, /(v211Response\\.status !== 404|response\\.status === 404)/);
  assert.match(bridge, /u\\.status='active'/);
  assert.match(bridge, /rows\\.length === 1/);
  assert.match(bridge, /rows\\.length !== 2/);
  assert.match(bridge, /spouse_links/);
  assert.match(bridge, /status='active'/);
});`;
  s=replaceSection(s,start,end,block,'v212 regression block');
  write(path,s);
}

// 6) Add a focused v274 regression without any real member IDs or names.
write('tests/v274StarryIdSpousePublicNumber.test.ts',`import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const central=readFileSync('worker/starryIdCentralRouter.ts','utf8');
const center=readFileSync('worker/starryIdMemberCenterPage.ts','utf8');
const publicRouter=readFileSync('worker/starryIdV211Router.ts','utf8');
const bridge=readFileSync('worker/starryIdV212PublicCardBridge.ts','utf8');

test('v274 central member responses carry the active spouse name',()=>{
  assert.match(central,/AS spouseName/);
  assert.match(central,/spouseName: row\\.spouseName \\|\\| ''/);
  assert.match(central,/sl\\.status='active'/);
});

test('v274 member center places spouse directly below the member number',()=>{
  assert.match(center,/field==='amwayId'&&user\\.spouseName/);
  assert.match(center,/夫妻綁定：/);
  assert.match(center,/className='spouse-link'/);
});

test('v274 public page accepts cardNumber and shows spouse under the identifier',()=>{
  assert.match(publicRouter,/WHERE cardNumber=\\? LIMIT 1/);
  assert.match(publicRouter,/data\\.spouseName=text\\(partner\\?\\.name\\)/);
  assert.match(publicRouter,/key==='amwayId'\\|\\|key==='cardNumber'/);
  assert.match(publicRouter,/夫妻綁定：/);
  assert.doesNotMatch(publicRouter,/\\['spouse','夫妻關係'\\]/);
});

test('v274 shared distributor number is accepted only for exactly two active spouses',()=>{
  assert.match(bridge,/rows\\.length !== 2/);
  assert.match(bridge,/spouse_links/);
  assert.match(bridge,/status='active'/);
  assert.match(bridge,/LIMIT 3/);
  assert.match(bridge,/CASE WHEN LOWER\\(slug\\)=LOWER\\(\\?\\)/);
});
`);

console.log('v274 patch applied');
