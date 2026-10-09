// Capture the original remover before the legacy explicit-logout bridge is installed.
const removeItem = Storage.prototype.removeItem;
export function discardCachedIdentity() {
  removeItem.call(localStorage, 'sq_current_user_v1');
  sessionStorage.removeItem('echostars_auth_session_checked_at');
}
