const CROWN_R2_ORIGIN = 'https://echostars.yukidu.workers.dev';
const CROWN_R2_FOLDER = 'Success_Crown';
const AMWAY_MEMBER_RE = /\/member\/member(\d+)\.html(?:$|[?#])/i;

function r2AvatarUrl(id: string) {
  const key = `${CROWN_R2_FOLDER}/${id}.jpg`;
  return `${CROWN_R2_ORIGIN}/api/r2/file/${encodeURIComponent(key)}`;
}

function syncCrownR2Avatar(card: Element) {
  if (!(card instanceof HTMLAnchorElement)) return;
  const match = card.href.match(AMWAY_MEMBER_RE);
  if (!match) return;

  const img = card.querySelector<HTMLImageElement>('.taiwan-crown-avatar img');
  if (!img) return;

  const nextSrc = r2AvatarUrl(match[1]);
  if (img.dataset.crownR2Src === nextSrc) return;

  img.dataset.crownR2Src = nextSrc;
  img.src = nextSrc;
}

function syncAllCrownR2Avatars(root: ParentNode = document) {
  root.querySelectorAll('a.taiwan-crown-card[href*="/member/member"]').forEach(syncCrownR2Avatar);
}

function startCrownR2AvatarSync() {
  syncAllCrownR2Avatars();

  const observer = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches('a.taiwan-crown-card[href*="/member/member"]')) syncCrownR2Avatar(node);
        syncAllCrownR2Avatars(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.body) startCrownR2AvatarSync();
else window.addEventListener('DOMContentLoaded', startCrownR2AvatarSync, { once: true });
