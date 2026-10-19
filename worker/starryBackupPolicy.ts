/** AI7 I31/I32 isolated staging-only backup policy control plane.
 * No scheduler, D1 export, R2 copy/delete, Cloudflare paid API or live restore here.
 */
export type BackupKind = 'd1' | 'r2';
export type BackupResource = Readonly<{id:string;name:string;kind:BackupKind;app:string;isPreview:boolean}>;
export const BACKUP_RESOURCES: readonly BackupResource[] = Object.freeze([
 {id:'d1:starry_id_db',name:'starry_id_db',kind:'d1',app:'Starry ID',isPreview:false},
 {id:'d1:echoes_db',name:'echoes_db',kind:'d1',app:'繁星回聲',isPreview:false},
 {id:'d1:go-starry-db',name:'go-starry-db',kind:'d1',app:'繁星任意門',isPreview:false},
 {id:'d1:box-starry-db',name:'box-starry-db',kind:'d1',app:'繁星方盒',isPreview:false},
 {id:'d1:starry_mirror_db',name:'starry_mirror_db',kind:'d1',app:'繁星心鏡',isPreview:false},
 {id:'d1:starsvideosync_db',name:'starsvideosync_db',kind:'d1',app:'繁星同步',isPreview:false},
 {id:'d1:preview-db',name:'preview-db',kind:'d1',app:'待確認預覽',isPreview:true},
 {id:'d1:box-starry-preview-db',name:'box-starry-preview-db',kind:'d1',app:'繁星方盒預覽',isPreview:true},
 {id:'d1:box-starry-preview-id-db',name:'box-starry-preview-id-db',kind:'d1',app:'繁星方盒預覽',isPreview:true},
 {id:'r2:echoes-audio-bucket',name:'echoes-audio-bucket',kind:'r2',app:'繁星回聲音檔',isPreview:false},
 {id:'r2:satrry-id-center',name:'satrry-id-center',kind:'r2',app:'Starry ID',isPreview:false},
 {id:'r2:preview-audio',name:'preview-audio',kind:'r2',app:'繁星回聲預覽',isPreview:true}
]);
export type BackupDraft = {resourceId:string;intervalDays:1|3|7;retentionDays:7|30|90};
export class BackupPolicyError extends Error {
 constructor(public code:string,public status=400){super(code)}
}
function need(ok:unknown,code:string,status=400):asserts ok {if(!ok)throw new BackupPolicyError(code,status)}
export function getBackupResource(id:unknown):BackupResource {
 need(typeof id==='string'&&id.length<100,'invalid_resource');
 const v=BACKUP_RESOURCES.find(x=>x.id===id);need(v,'resource_not_registered',404);return v;
}
export function backupDefaults(r:BackupResource):BackupDraft {
 return {resourceId:r.id,intervalDays:r.kind==='d1'?1:7,retentionDays:30};
}
export function validateBackupDraft(input:unknown):BackupDraft {
 need(input&&typeof input==='object'&&!Array.isArray(input),'invalid_draft');
 const v=input as Record<string,unknown>,r=getBackupResource(v.resourceId);
 need(Number.isInteger(v.intervalDays)&&[1,3,7].includes(v.intervalDays as number),'invalid_interval');
 need(Number.isInteger(v.retentionDays)&&[7,30,90].includes(v.retentionDays as number),'invalid_retention');
 return {resourceId:r.id,intervalDays:v.intervalDays as 1|3|7,retentionDays:v.retentionDays as 7|30|90};
}
type Row={resource_id:string;resource_kind:BackupKind;interval_days:number;retention_days:number;
 revision:number;updated_by:string;updated_at:number;enabled:number};
function requireDb(env:{STARRY_ID_DB?:any}):any {
 need(env.STARRY_ID_DB,'backup_policy_database_unavailable',503);return env.STARRY_ID_DB;
}
function publicPolicy(row:Row) {
 const res=BACKUP_RESOURCES.find(r=>r.id===row.resource_id&&r.kind===row.resource_kind);
 if(!res)return null;
 return {...validateBackupDraft({resourceId:res.id,intervalDays:row.interval_days,retentionDays:row.retention_days}),
   revision:row.revision,updatedAt:row.updated_at,status:'staged',schedulerEnabled:false};
}
export async function readBackupManagement(env:{STARRY_ID_DB?:any}) {
 const db=requireDb(env);
 const [policies,history,runs]=await Promise.all([
  db.prepare('SELECT resource_id,resource_kind,interval_days,retention_days,revision,updated_by,updated_at,enabled FROM starry_backup_policies ORDER BY resource_id LIMIT 100').all(),
  db.prepare('SELECT id,resource_id,action,revision,actor_id,created_at,before_json,after_json FROM starry_backup_policy_revisions ORDER BY created_at DESC LIMIT 30').all(),
  db.prepare('SELECT id,resource_id,status,started_at,completed_at,object_count,byte_count,integrity_status,restore_test_status,backup_version,storage_label FROM starry_backup_runs ORDER BY started_at DESC LIMIT 30').all()
 ]);
 return {resources:BACKUP_RESOURCES,policies:(policies?.results||[]).map(publicPolicy).filter(Boolean),
  history:(history?.results||[]).map((r:any)=>({id:r.id,resourceId:r.resource_id,action:r.action,revision:r.revision,
    at:r.created_at,before:r.before_json?JSON.parse(r.before_json):null,after:JSON.parse(r.after_json)})),
  backups:(runs?.results||[]).map((r:any)=>({id:r.id,resourceId:r.resource_id,status:r.status,
    startedAt:r.started_at,completedAt:r.completed_at,objectCount:r.object_count,byteCount:r.byte_count,
    integrityStatus:r.integrity_status,restoreTestStatus:r.restore_test_status,version:r.backup_version,
    storageLabel:r.storage_label})),
  inventoryCheckedAt:'2026-10-20',readonlySourceInventory:true,billingVerified:false,
  stagingOnly:true,schedulerEnabled:false,liveBackupEnabled:false,liveRestoreEnabled:false,
  timeTravel:{freeDays:7,paidDays:30,userConfigurable:false},
  notice:'設定草稿不啟用備份；Cloudflare D1 Time Travel 官方還原視窗不是本頁自訂保存天數。'};
}
export function previewBackupPolicy(input:unknown) {
 const draft=validateBackupDraft(input);
 return {valid:true,draft,stagingOnly:true,schedulerEnabled:false,willCreateBackup:false,
   willReadSourceData:false,willRestore:false,estimatedStorage:null,estimatedCost:null,
   costNotice:'未取得 Billing Read 與備份量，不能保證免費'};
}
export async function stageBackupPolicy(env:{STARRY_ID_DB?:any},actor:string,input:any) {
 need(typeof actor==='string'&&actor.length>0&&actor.length<=128,'invalid_actor',403);
 need(input?.action==='stage','invalid_action');
 const d=validateBackupDraft(input.draft);
 need(Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision>=0,'invalid_expected_revision');
 const resource=getBackupResource(d.resourceId),db=requireDb(env);
 const old:Row|null=await db.prepare('SELECT resource_id,resource_kind,interval_days,retention_days,revision,updated_by,updated_at,enabled FROM starry_backup_policies WHERE resource_id=?')
   .bind(resource.id).first();
 const was=old?.revision||0;
 need(was===input.expectedRevision,'stale_revision',409);
 const rev=was+1,at=Date.now(),auditId='backup-policy-'+crypto.randomUUID();
 const before=old?JSON.stringify({resourceId:old.resource_id,intervalDays:old.interval_days,retentionDays:old.retention_days}):null;
 const after=JSON.stringify(d);
 const write=old
 ?db.prepare('UPDATE starry_backup_policies SET interval_days=?,retention_days=?,revision=?,updated_by=?,updated_at=? WHERE resource_id=? AND revision=? AND enabled=0')
   .bind(d.intervalDays,d.retentionDays,rev,actor,at,resource.id,was)
 :db.prepare('INSERT OR IGNORE INTO starry_backup_policies (resource_id,resource_kind,interval_days,retention_days,revision,updated_by,updated_at,enabled) VALUES (?,?,?,?,?,?,?,0)')
   .bind(resource.id,resource.kind,d.intervalDays,d.retentionDays,rev,actor,at);
 const audit=db.prepare("INSERT INTO starry_backup_policy_revisions (id,resource_id,action,revision,actor_id,created_at,before_json,after_json) SELECT ?,?,'stage',?,?,?,?,? FROM starry_backup_policies WHERE resource_id=? AND revision=? AND updated_by=? AND enabled=0")
   .bind(auditId,resource.id,rev,actor,at,before,after,resource.id,rev,actor);
 const results=await db.batch([write,audit]);
 need(Number(results?.[0]?.meta?.changes||0)===1,'stale_revision',409);
 need(Number(results?.[1]?.meta?.changes||0)===1,'policy_audit_failed',503);
 return {success:true,draft:d,revision:rev,auditId,stagingOnly:true,schedulerEnabled:false,
  liveBackupEnabled:false,liveRestoreEnabled:false};
}
