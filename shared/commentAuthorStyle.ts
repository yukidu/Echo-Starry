/**
 * Only the verified account's historical and future comments use standard
 * member-name styling. Author names and isAdmin flags alone are NOT identity
 * evidence: another administrator must retain their existing rainbow styling.
 * This affects rendering only and never alters persisted comments or privileges.
 */
export function isDuduDragonComment(comment:{authorEmail?:string|null}):boolean{
  return String(comment.authorEmail??'').trim().toLowerCase()==='yukidu@gmail.com';
}
