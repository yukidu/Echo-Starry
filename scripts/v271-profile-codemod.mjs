import { readFileSync, writeFileSync, rmSync } from 'node:fs';

function read(path) { return readFileSync(path, 'utf8'); }
function write(path, value) { writeFileSync(path, value); }
function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing marker: ${label}`);
  return source.replace(from, to);
}

// 1) ProfileModal: one native React motto field, dice only in edit mode, native large save/cancel.
{
  const path = 'src/components/ProfileModal.tsx';
  let s = read(path);

  s = replaceOnce(s,
`  const [residence, setResidence] = useState(currentUser?.residence || '臺北');
  const [center, setCenter] = useState(currentUser?.center || '無');
  const [rank, setRank] = useState<AmwayRank>(currentUser?.rank || '無');
  const [joinReason, setJoinReason] = useState<JoinReason>(currentUser?.joinReason || '事業');
  const [stayReason, setStayReason] = useState<StayReason | string>(currentUser?.stayReason || '打造自己的事業與團隊');`,
`  const [residence, setResidence] = useState(currentUser?.residence || '');
  const [center, setCenter] = useState(currentUser?.center || '');
  const [rank, setRank] = useState<AmwayRank>((currentUser?.rank || '') as AmwayRank);
  const [joinReason, setJoinReason] = useState<JoinReason>((currentUser?.joinReason || '') as JoinReason);
  const [stayReason, setStayReason] = useState<StayReason | string>(currentUser?.stayReason || '');`,
  'empty defaults');

  s = replaceOnce(s,
`  const [birthday, setBirthday] = useState(currentUser?.birthday || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');`,
`  const [birthday, setBirthday] = useState(currentUser?.birthday || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');
  const [motto, setMotto] = useState(currentUser?.motto || '');
  const [isLoadingMotto, setIsLoadingMotto] = useState(false);
  const [mottoStatus, setMottoStatus] = useState('');`,
  'motto state');

  const resetPairs = [
    ["setResidence(currentUser.residence || '臺北')", "setResidence(currentUser.residence || '')"],
    ["setCenter(currentUser.center || '無')", "setCenter(currentUser.center || '')"],
    ["setRank(currentUser.rank || '無')", "setRank((currentUser.rank || '') as AmwayRank)"],
    ["setJoinReason(currentUser.joinReason || '事業')", "setJoinReason((currentUser.joinReason || '') as JoinReason)"],
    ["setStayReason(currentUser.stayReason || '未填寫')", "setStayReason(currentUser.stayReason || '')"]
  ];
  for (const [from,to] of resetPairs) s = s.split(from).join(to);

  s = s.replace(
    /setBirthday\(currentUser\.birthday \|\| ''\);setAvatar\(currentUser\.avatar \|\| ''\);setIsEditing\(true\);onForceEditHandled\?\.\(\);/,
    "setBirthday(currentUser.birthday || '');setAvatar(currentUser.avatar || '');setMotto(currentUser.motto || '');setMottoStatus('');setIsEditing(true);onForceEditHandled?.();"
  );
  if (!s.includes("setMotto(currentUser.motto || '');setMottoStatus('');setIsEditing(true);onForceEditHandled?.();")) throw new Error('force edit motto reset failed');

  s = replaceOnce(s,
`    setBirthday(currentUser.birthday || '');
    setAvatar(currentUser.avatar || '');
    setIsEditing(true);`,
`    setBirthday(currentUser.birthday || '');
    setAvatar(currentUser.avatar || '');
    setMotto(currentUser.motto || '');
    setMottoStatus('');
    setIsEditing(true);`,
  'start edit motto reset');

  s = replaceOnce(s,
`  const handleSaveProfile = async () => {`,
`  const handleRandomMotto = async () => {
    if (isLoadingMotto) return;
    setIsLoadingMotto(true);
    setMottoStatus('正在抽一句…');
    try {
      const response = await fetch(\`/api/random-motto?t=\${Date.now()}\`, {
        method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
      });
      const data = await response.json().catch(() => ({}));
      const nextMotto = String(data?.motto || '').trim();
      if (!response.ok || !nextMotto) throw new Error(data?.error || '目前無法取得繁星雞湯');
      setMotto(nextMotto);
      setMottoStatus('已從繁星雞湯帶入，可再自行修改');
    } catch (error) {
      setMottoStatus(error instanceof Error ? error.message : '目前無法取得繁星雞湯');
    } finally {
      setIsLoadingMotto(false);
    }
  };

  const handleSaveProfile = async () => {`,
  'random motto handler');

  s = replaceOnce(s,
`      stayReason,
      sponsor: sponsor.trim(),`,
`      stayReason,
      motto: motto.trim(),
      sponsor: sponsor.trim(),`,
  'motto payload');

  s = replaceOnce(s,
`      await onUpdateProfile(payload);
      await refreshOrganizationDisplay();
      setIsEditing(false);`,
`      await onUpdateProfile(payload);
      setOrganizationDisplayName(name.trim());
      setIsEditing(false);
      setMottoStatus('');`,
  'nonblocking post-save ui');

  s = replaceOnce(s,
`            {currentUser && (isEditing ? <><button disabled={isSaving} onClick={handleSaveProfile} className="px-2 py-2 rounded-lg bg-white/20 text-xs">儲存</button><button disabled={isSaving} onClick={()=>setIsEditing(false)} className="px-2 py-2 text-xs">取消</button></> : <button onClick={handleStartEdit} disabled={currentProfileEditCount>=5} className="px-2 py-2 rounded-lg bg-white/20 text-xs">修改</button>)}`,
`            {currentUser && (isEditing ? <><button disabled={isSaving} onClick={handleSaveProfile} className="px-4 py-2.5 rounded-xl bg-yellow-300 text-slate-950 text-sm font-black shadow-lg ring-2 ring-white disabled:opacity-60">{isSaving ? '儲存中…' : '儲存'}</button><button disabled={isSaving} onClick={()=>{setMottoStatus('');setIsEditing(false)}} className="px-3 py-2.5 rounded-xl bg-white/15 text-sm font-bold disabled:opacity-60">取消</button></> : <button onClick={handleStartEdit} disabled={currentProfileEditCount>=5} className="px-2 py-2 rounded-lg bg-white/20 text-xs">修改</button>)}`,
  'top save actions');

  s = replaceOnce(s,
`    <div className="profile-page w-full min-h-[70dvh]">`,
`    <div className={\`profile-page w-full min-h-[70dvh] \${isEditing ? 'pb-24' : ''}\`}>`,
  'profile editing bottom padding');

  s = replaceOnce(s,
`                      {/* Instant live 9-grid preview in tab 1 */}`,
`                      <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700" data-profile-motto-readonly="1">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">座右銘</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                          {currentUser.motto || '未填寫'}
                        </span>
                      </div>

                      {/* Instant live 9-grid preview in tab 1 */}`,
  'readonly motto');

  s = replaceOnce(s,
`                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: User Rated Tracks`,
`                      </div>

                      <div data-profile-motto-primary="1" className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <label htmlFor="profile-motto" className="font-bold text-slate-700 dark:text-slate-300">座右銘</label>
                          <button
                            type="button"
                            onClick={handleRandomMotto}
                            disabled={isLoadingMotto || isSaving}
                            className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-bold disabled:opacity-50"
                          >
                            {isLoadingMotto ? '抽取中…' : '🎲 隨機一句'}
                          </button>
                        </div>
                        <textarea
                          id="profile-motto"
                          rows={3}
                          maxLength={200}
                          value={motto}
                          onChange={event => setMotto(event.target.value)}
                          placeholder="寫下你的座右銘"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                        />
                        <div className="text-[10px] text-slate-500 mt-1 min-h-[14px]">
                          {mottoStatus || '可自行輸入，或從繁星雞湯隨機抽一句；儲存時會直接寫入 Starry ID。'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: User Rated Tracks`,
  'native motto editor');

  s = replaceOnce(s,
`      {/* Avatar Crop Modal */}`,
`      {currentUser && isEditing && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-3 z-[240] w-[calc(100%-24px)] max-w-2xl rounded-[28px] bg-white/95 dark:bg-slate-900/95 shadow-2xl border border-slate-200 dark:border-slate-700 p-3 grid grid-cols-2 gap-3" data-profile-native-floating-actions="1">
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={isSaving}
            className="min-h-[68px] rounded-2xl bg-emerald-600 text-white text-2xl font-black shadow-lg disabled:opacity-60"
          >
            💾 {isSaving ? '儲存中…' : '儲存'}
          </button>
          <button
            type="button"
            onClick={()=>{setMottoStatus('');setIsEditing(false)}}
            disabled={isSaving}
            className="min-h-[68px] rounded-2xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white text-2xl font-black shadow-lg disabled:opacity-60"
          >
            取消
          </button>
        </div>
      )}

      {/* Avatar Crop Modal */}`,
  'native floating actions');

  write(path, s);
}

// 2) App: do not re-check spouse candidate when dealer id did not change.
{
  const path = 'src/App.tsx';
  let s = read(path);
  s = replaceOnce(s,
`    const requestedDealerId=String(updatedProfile.amwayId ?? currentUser.amwayId ?? '').trim();
    if(requestedDealerId){`,
`    const requestedDealerId=String(updatedProfile.amwayId ?? currentUser.amwayId ?? '').trim();
    const currentDealerId=String(currentUser.amwayId || '').trim();
    if(requestedDealerId && requestedDealerId !== currentDealerId){`,
  'dealer id unchanged shortcut');
  write(path, s);
}

// 3) API helper: remove the old request-interception motto bridge.
{
  const path = 'src/utils/api.ts';
  let s = read(path);
  s = s.replace("import { commitProfileMottoSave, enhanceProfileSaveRequest } from '../profileMottoSaveBridge';\n", '');
  s = replaceOnce(s,
`  const enhanced = enhanceProfileSaveRequest(url, options);
  const response = await fetch(url, enhanced.options);`,
`  const response = await fetch(url, options);`,
  'plain api fetch');
  s = s.replace('  commitProfileMottoSave(enhanced.motto);\n', '');
  write(path, s);
}

// 4) main: native React profile owns motto now.
{
  const path = 'src/main.tsx';
  let s = read(path);
  s = s.replace("import './v264ProfileMotto';\n", '');
  write(path, s);
}

// 5) Backend: strict synchronous Starry ID persistence for explicit profile save.
{
  const path = 'worker/privacyCrawlerRouter.ts';
  let s = read(path);
  s = replaceOnce(s,
`import { syncEchoMemberToStarryBestEffort } from './starryIdSync';`,
`import { syncEchoMemberToStarryBestEffort } from './starryIdSync';
import { syncSavedEchoProfileToStarryId } from './starryIdFastProfileSync';`,
  'strict sync import');

  s = replaceOnce(s,
`      if (directProfileWrite) {
        const userId = decodeURIComponent(directProfileWrite[1]);
        const synced = await syncEchoMemberToStarryBestEffort(env as any, userId, 'echostars', 'member-profile-update');
        if ((env as any).STARRY_ID_DB && !synced) {
          // Echo already committed successfully. Never turn that success into an error.
          // Queue another best-effort central attempt and let the member leave edit mode.
          scheduleStarrySync(ctx, env, userId, 'echostars', 'member-profile-update-retry');
        }
      } else {`,
`      if (directProfileWrite) {
        const userId = decodeURIComponent(directProfileWrite[1]);
        const savedPayload: any = await response.clone().json().catch(() => null);
        const savedUser = savedPayload?.user || savedPayload;
        if (!savedUser?.id) {
          return withPrivacyHeaders(new Response(JSON.stringify({ error: '繁星回聲已寫入，但無法取得會員資料同步 Starry ID，請再按一次儲存。' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
          }));
        }
        try {
          await syncSavedEchoProfileToStarryId(env as any, savedUser, userId || 'echostars');
        } catch (error) {
          console.warn('Strict Starry ID profile sync failed', {
            userId,
            error: error instanceof Error ? error.message : 'unknown'
          });
          return withPrivacyHeaders(new Response(JSON.stringify({
            error: error instanceof Error ? \`Starry ID 儲存失敗：\${error.message}\` : 'Starry ID 儲存失敗，請再按一次儲存。'
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
          }));
        }
      } else {`,
  'strict profile sync');
  write(path, s);
}

// 6) Remove obsolete DOM/request motto layers completely.
rmSync('src/v264ProfileMotto.ts', { force: true });
rmSync('src/profileMottoSaveBridge.ts', { force: true });

// 7) Remove tests tied to deleted architecture; v271 test below replaces them.
for (const path of [
  'tests/v264IosMediaMotto.test.ts',
  'tests/v266ProfileSaveUi.test.ts',
  'tests/v268ProfileEditFreeze.test.ts',
  'tests/v269ProfileDefaultsMottoCleanup.test.ts',
  'tests/v270ProfileSaveMottoSync.test.ts'
]) rmSync(path, { force: true });
