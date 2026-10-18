import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const app=load('src/App.tsx');
const links=load('src/components/SpeakerNameLink.tsx');
const badge=load('src/components/AiBadge.css');
const newcomer=load('src/components/AudioCard.css');
const home=load('src/v139HomeUploadPolish.ts');
const notifications=load('src/components/NotificationsView.tsx');
const profile=load('src/components/SpeakerProfilePage.tsx');
const audio=load('src/components/AudioCard.tsx');
const detail=load('src/components/DetailView.tsx');
const mini=load('src/components/MiniPlayer.tsx');
const stats=load('src/components/StatisticsView.tsx');
const manage=load('src/v161AudioManagementNavigation.tsx');
const comments=load('src/components/CommentsSection.tsx');

test('speaker names across the app use a reusable accessible link opening an in-place dialog',()=>{
 assert.match(links,/echostars:open-speaker/);
 assert.match(links,/stopPropagation/);
 assert.match(links,/type="button" data-speaker-name=/);
 assert.match(app,/addEventListener\('echostars:open-speaker'/);
 assert.match(app,/role="dialog" aria-modal="true"/);
 assert.match(app,/max-w-\[570px\] max-h-\[79dvh\]/);
 assert.match(app,/<SpeakerProfilePage compact/);
 assert.doesNotMatch(app,/speakerProfileName \? \(<Suspense fallback/);
 assert.match(profile,/compact\?:boolean/);
 for(const file of [audio,detail,mini,stats,manage,comments]){
   assert.match(file,/SpeakerNameLink/, 'All major speaker name surfaces must be linked');
 }
});

test('Ai icon keeps transparent center and the same thin rainbow border as Newcomer badge',()=>{
 assert.match(newcomer,/padding: 1px/);
 assert.match(badge,/padding: 1px/);
 assert.match(badge,/\.starry-ai-badge-text \{/);
 assert.match(badge,/-webkit-background-clip: text/);
 assert.match(badge,/-webkit-text-fill-color: transparent/);
 assert.match(badge,/starry-ai-letter-flow/);
 assert.match(badge,/starry-ai-border-flow 2\.4s/);
 assert.match(badge,/mask-composite: exclude/);
 assert.doesNotMatch(badge,/background: #101827/);
});

test('notification navigation is no longer trapped by global synchronous mutation resyncs',()=>{
 assert.match(home,/requestAnimationFrame\(\(\) => \{/);
 assert.doesNotMatch(home,/queueMicrotask\(\(\) => \{/);
 assert.match(home,/dataset\.mainTab === 'notifications'/);
 assert.match(home,/if\(relevant\)queueSync\(\)/);
 assert.match(notifications,/const \[visibleRows,setVisibleRows\] = useState\(25\)/);
 assert.match(notifications,/mentionNotifications\.slice\(0,visibleRows\)/);
 assert.match(notifications,/pendingUsers\.slice\(0,visibleRows\)/);
 assert.match(notifications,/newMembers\.slice\(0,visibleRows\)/);
 assert.match(notifications,/React\.memo\(NotificationsViewComponent/);
 assert.match(notifications,/new AbortController\(\)/);
});
