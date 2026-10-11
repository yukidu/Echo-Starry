const CROWN_R2_ORIGIN = 'https://echostars.yukidu.workers.dev';
const CROWN_R2_FOLDER = 'Success_Crown';
const CROWN_R2_CACHE_BUSTER = '20261011-2';
const AMWAY_MEMBER_RE = /\/member\/member(\d+)\.html(?:$|[?#])/i;
const R2_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG', 'WEBP'];

function r2AvatarUrl(id: string, ext: string) {
  const key = `${CROWN_R2_FOLDER}/${id}.${ext}`;
  return `${CROWN_R2_ORIGIN}/api/r2/file/${encodeURIComponent(key)}?v=${CROWN_R2_CACHE_BUSTER}`;
}

function probeImage(url: string) {
  return new Promise<boolean>(resolve => {
    const probe = new Image();
    const finish = (ok: boolean) => {
      probe.onload = null;
      probe.onerror = null;
      resolve(ok);
    };
    probe.onload = () => finish(true);
    probe.onerror = () => finish(false);
    probe.src = url;
  });
}

async function resolveR2AvatarUrl(id: string) {
  for (const ext of R2_IMAGE_EXTENSIONS) {
    const candidate = r2AvatarUrl(id, ext);
    if (await probeImage(candidate)) return candidate;
  }
  return '';
}

async function syncCrownR2Avatar(card: Element) {
  if (!(card instanceof HTMLAnchorElement)) return;
  const match = card.href.match(AMWAY_MEMBER_RE);
  if (!match) return;

  const img = card.querySelector<HTMLImageElement>('.taiwan-crown-avatar img');
  if (!img) return;

  const id = match[1];
  if (img.dataset.crownR2Status === `ready:${id}` || img.dataset.crownR2Status === `loading:${id}`) return;

  // Keep the already-working original image visible while we verify the R2 object.
  // This avoids the card falling back to a large initial when an assumed extension is wrong.
  img.dataset.crownR2Status = `loading:${id}`;
  const resolved = await resolveR2AvatarUrl(id);

  if (!img.isConnected) return;
  if (resolved) {
    img.dataset.crownR2Status = `ready:${id}`;
    img.dataset.crownR2Src = resolved;
    img.src = resolved;
  } else {
    // Leave the original avatar untouched if no matching R2 file exists.
    img.dataset.crownR2Status = `missing:${id}`;
    console.warn(`[皇冠大使] R2 找不到 Success_Crown/${id} 的支援圖片格式`);
  }
}

function syncAllCrownR2Avatars(root: ParentNode = document) {
  root.querySelectorAll('a.taiwan-crown-card[href*="/member/member"]').forEach(card => {
    void syncCrownR2Avatar(card);
  });
}

function startCrownR2AvatarSync() {
  syncAllCrownR2Avatars();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('a.taiwan-crown-card[href*="/member/member"]')) void syncCrownR2Avatar(node);
        syncAllCrownR2Avatars(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.body) startCrownR2AvatarSync();
else window.addEventListener('DOMContentLoaded', startCrownR2AvatarSync, { once: true });
