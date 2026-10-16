import fs from 'node:fs';

function replaceOne(source,needle,replacement,label){
  const count=source.split(needle).length-1;
  if(count!==1) throw new Error(`${label}: expected 1 match, got ${count}`);
  return source.replace(needle,replacement);
}

// Remove the obsolete public spouse visibility toggle. A confirmed spouse is now
// intentionally shown under the public member/distributor identifier.
{
  const path='worker/starryIdV222Enhancer.ts';
  let s=fs.readFileSync(path,'utf8');
  const old=`        if(l?.status==='active'){
          const label=document.createElement('label');label.className='v224-checkbox';const toggle=document.createElement('input');toggle.type='checkbox';
          const settings=await api('/api/card-settings');toggle.checked=Boolean(settings.visibility?.spouse);
          label.append(toggle,document.createTextNode('在公開電子名片顯示夫妻關係'));panel.append(label);
          toggle.onchange=async()=>{try{await api('/api/card-settings',{method:'PUT',body:JSON.stringify({visibility:{spouse:toggle.checked}})});notify('電子名片顯示設定已儲存')}catch(e){toggle.checked=!toggle.checked;notify(e.message)}};
        }`;
  const next=`        if(l?.status==='active'){
          const publicNote=document.createElement('div');publicNote.className='v222-help';
          publicNote.textContent='公開電子名片會在會員編號下方同步顯示夫妻綁定對象。';
          panel.append(publicNote);
        }`;
  s=replaceOne(s,old,next,'spouse visibility toggle');
  fs.writeFileSync(path,s);
}

{
  const path='tests/starryIdV253InstantNavigation.test.ts';
  let s=fs.readFileSync(path,'utf8');
  s=replaceOne(s,'assert.match(bridge, /findUniqueActiveMember/);','assert.match(bridge, /findCanonicalActiveMember/);','v253 canonical finder');
  fs.writeFileSync(path,s);
}

{
  const path='tests/starryIdV224SpouseDistributor.test.ts';
  let s=fs.readFileSync(path,'utf8');
  const old=`test('spouse profile is read-only, unlink via action, public card opt-in',()=>{
  assert.match(page,/已與 .* 綁定夫妻/);
  assert.match(page,/解除夫妻綁定/);
  assert.match(page,/api\\/spouse-action/);
  assert.match(page,/visibility:\\{spouse:toggle\\.checked\\}/);
  assert.match(publicCard,/DEFAULT_HIDDEN = new Set\\(\\['phone','birthday','spouse'\\]\\)/);
  assert.match(publicCard,/\\['spouse','夫妻關係'\\]/);
});`;
  const next=`test('spouse profile is read-only, unlink via action, public card always mirrors spouse under member number',()=>{
  assert.match(page,/已與 .* 綁定夫妻/);
  assert.match(page,/解除夫妻綁定/);
  assert.match(page,/api\\/spouse-action/);
  assert.doesNotMatch(page,/visibility:\\{spouse:toggle\\.checked\\}/);
  assert.match(page,/公開電子名片會在會員編號下方同步顯示夫妻綁定對象/);
  assert.match(publicCard,/data\\.spouseName=text\\(partner\\?\\.name\\)/);
  assert.match(publicCard,/key==='amwayId'\\|\\|key==='cardNumber'/);
  assert.doesNotMatch(publicCard,/\\['spouse','夫妻關係'\\]/);
});`;
  s=replaceOne(s,old,next,'v224 public spouse policy');
  fs.writeFileSync(path,s);
}

console.log('v274 spouse visibility/tests aligned');
