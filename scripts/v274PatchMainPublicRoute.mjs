import fs from 'node:fs';

function replaceSection(source,startMarker,endMarker,replacement,label){
  const start=source.indexOf(startMarker);
  const end=source.indexOf(endMarker,start);
  if(start<0||end<0) throw new Error(`${label}: markers not found`);
  if(source.indexOf(startMarker,start+1)>=0) throw new Error(`${label}: duplicate start marker`);
  return source.slice(0,start)+replacement+source.slice(end);
}

const routerPath='worker/starryIdV211Router.ts';
let router=fs.readFileSync(routerPath,'utf8');
const block=`if(!card && /^[0-9]+$/.test(slug)) {
  const matches: any = await db.prepare(\`SELECT u.id,p.amwayId FROM users u JOIN profiles p ON p.userId=u.id WHERE u.status='active' AND TRIM(COALESCE(p.amwayId,''))=? ORDER BY u.id LIMIT 3\`).bind(slug).all();
  const rows = matches?.results || [];
  let directMember: any = null;
  if(rows.length===1 && text(rows[0].amwayId)===slug) {
    directMember = await readMember(db,rows[0].id);
  } else if(rows.length===2 && rows.every((row:any)=>text(row.amwayId)===slug)) {
    const pair: any = await db.prepare(\`SELECT id FROM spouse_links
      WHERE status='active' AND ((userA=? AND userB=?) OR (userA=? AND userB=?)) LIMIT 1\`)
      .bind(rows[0].id,rows[1].id,rows[1].id,rows[0].id).first().catch(()=>null);
    if(pair) {
      const existing: any = await db.prepare(\`SELECT userId FROM public_cards WHERE userId IN (?,?)
        ORDER BY CASE WHEN LOWER(slug)=LOWER(?) THEN 0 ELSE 1 END, seq, userId LIMIT 1\`)
        .bind(rows[0].id,rows[1].id,slug).first().catch(()=>null);
      const selectedId=text(existing?.userId)||text(rows[0].id);
      directMember=await readMember(db,selectedId);
    }
  }
  if(directMember && directMember.status==='active') {
    await ensureCard(db,directMember);
    card = await db.prepare('SELECT userId,slug,cardNumber FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first();
  }
}`;
router=replaceSection(router,"if(!card && /^[0-9]+$/.test(slug)) {","\nif(!card) return null;",block,'public numeric route');
fs.writeFileSync(routerPath,router);

const v250Path='tests/starryIdV250AmwayPublicCard.test.ts';
let v250=fs.readFileSync(v250Path,'utf8');
v250=v250.replace("test('v250 resolves a missing numeric public-card slug from the unique active Amway ID', () => {","test('v250 resolves a missing numeric public-card slug from one member or an active spouse pair', () => {");
v250=v250.replace("  assert.match(router, /LIMIT 2/);","  assert.match(router, /LIMIT 3/);");
const uniqueAssert="  assert.match(router, /text\\(rows\\[0\\]\\.amwayId\\)===slug/);";
if(!v250.includes(uniqueAssert)) throw new Error('v250 unique assertion anchor missing');
v250=v250.replace(uniqueAssert,uniqueAssert+"\n  assert.match(router, /rows\\.length===2/);\n  assert.match(router, /spouse_links/);\n  assert.match(router, /status='active'/);");
fs.writeFileSync(v250Path,v250);

const v274Path='tests/v274StarryIdSpousePublicNumber.test.ts';
let v274=fs.readFileSync(v274Path,'utf8');
const publicAnchor="  assert.match(publicRouter,/夫妻綁定：/);";
if(!v274.includes(publicAnchor)) throw new Error('v274 public assertion anchor missing');
v274=v274.replace(publicAnchor,publicAnchor+"\n  assert.match(publicRouter,/rows\\.length===2/);\n  assert.match(publicRouter,/spouse_links/);\n  assert.match(publicRouter,/status='active'/);");
fs.writeFileSync(v274Path,v274);

console.log('v274 main public route patch applied');
