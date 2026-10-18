import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDuduDragonComment} from '../shared/commentAuthorStyle';

const source=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const comments=source('src/components/CommentsSection.tsx');

test('only Dudu Dragon historical account is exempt from rainbow comment names',()=>{
  assert.equal(isDuduDragonComment({authorEmail:'yukidu@gmail.com'}),true);
  assert.equal(isDuduDragonComment({authorEmail:' Yukidu@Gmail.Com '}),true);
  assert.equal(isDuduDragonComment({authorEmail:'other@example.com'}),false);
  assert.equal(isDuduDragonComment({authorEmail:''}),false);
  assert.equal(isDuduDragonComment({}),false);
});

test('previous and future comments use the same account-based rendering rule',()=>{
  assert.match(comments,/import \{ isDuduDragonComment \} from '\.\.\/\.\.\/shared\/commentAuthorStyle'/);
  assert.match(comments,/!isDuduDragonComment\(c\) && \(c\.isAdmin \|\| displayAuthorBadge === '貢獻者'\)/);
  assert.match(comments,/isClickable \? <span className="font-bold text-slate-800 dark:text-slate-100/);
  assert.match(comments,/getRegisteredAuthor\(c\)/);
  assert.match(comments,/displayAuthorName = isAiSpeaker/);
  assert.match(comments,/showBadge && <span/);
  assert.match(comments,/isSuperAdminModerator/);
  assert.match(comments,/\(isAuthor \|\| isSuperAdminModerator/);
});

test('other rainbow animations and data persistence are unaffected',()=>{
  const css=source('src/index.css');
  const app=source('src/App.tsx');
  assert.match(css,/\.rainbow-admin-text/);
  assert.match(comments,/rainbow-admin-text font-bold/);
  assert.match(comments,/isAiSpeaker \? <span/);
  assert.match(app,/authorBadge = isSuperAdmin/);
  assert.match(app,/isAdmin: isSuperAdmin/);
  assert.doesNotMatch(source('shared/commentAuthorStyle.ts'),/UPDATE |DELETE FROM |INSERT INTO /);
});
