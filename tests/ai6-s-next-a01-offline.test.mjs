// S-NEXT-A01 AI6. Offline SYNTHETIC fixtures only. No imports except node:test/assert.
// This is a reference policy simulator, NOT the deployed Starry ID authorization engine.
import test from 'node:test';
import assert from 'node:assert/strict';
const fixtures = [["guest ops","guest","ops.summary.read","DENY"],["member ops","member","ops.summary.read","DENY"],["echo admin ops","echoAdmin","ops.summary.read","DENY"],["echo admin download","echoAdmin","download.admin.write","DENY"],["echo admin id","echoAdmin","id.role.change","DENY"],["echo admin echo","echoAdmin","echo.admin.write","ALLOW"],["central ops","central","ops.summary.read","ALLOW"],["central private","central","echo.audio.private.read","DENY"],["central download","central","download.admin.write","DENY"],["member own","member","echo.audio.private.read","ALLOW"],["member other resource","member","echo.audio.private.read","DENY","resourceMismatch"],["expired session","member","echo.audio.private.read","DENY","sessionExpired"],["revoked session","member","echo.audio.private.read","DENY","sessionStale"],["old role","member","echo.audio.private.read","DENY","roleStale"],["old permission","member","echo.audio.private.read","DENY","permissionStale"],["wrong issuer","member","echo.audio.private.read","DENY","issuerMismatch"],["wrong audience","member","echo.audio.private.read","DENY","audienceMismatch"],["wrong app","member","echo.audio.private.read","DENY","appMismatch"],["wrong action","member","echo.audio.private.read","DENY","actionMismatch"],["old resource","member","echo.audio.private.read","DENY","resourceStale"],["old source","member","echo.audio.private.read","DENY","sourceStale"],["old revoke watermark","member","echo.audio.private.read","DENY","revocationStale"],["restore epoch mismatch","member","echo.audio.private.read","DENY","restoreStale"],["identity offline","member","echo.audio.private.read","DENY","identityUnknown"],["resource offline","member","echo.audio.private.read","DENY","resourceUnknown"],["replay nonce","member","echo.audio.private.read","DENY","nonceReplay"],["revoked before send","member","echo.audio.private.send","DENY","revokeAtSend"],["source changed before send","member","echo.audio.private.send","DENY","sourceAtSend"],["permission changed before send","member","echo.audio.private.send","DENY","permissionAtSend"],["two admin stale","echoAdmin","echo.admin.write","DENY","adminRace"],["conflicting evidence","central","ops.summary.read","DENY","evidenceConflict"],["expired proof","central","ops.summary.read","DENY","proofExpired"],["platform green AI unknown","central","ai.provider.send","DENY","aiUnknown"],["platform green backup hold","central","backup.restore.commit","DENY","backupHold"],["app green platform fault","central","ops.summary.read","ALLOW","platformFault"],["platform unknown app green","central","ops.summary.read","ALLOW","platformUnknown"],["stats read no export","statsReader","stats.report.export","DENY"],["PWA stale admin","central","ops.summary.read","DENY","pwaStale"],["public cross app","member","go.public.read","ALLOW"],["2000 members ops","member","ops.summary.read","DENY","bulk2000"],["head missing","central","backup.delete.commit","DENY","headUnknown"],["double admin same person","central","backup.restore.commit","DENY","sameApprover"]];
const grants = {guest:[],member:['echo.audio.private.read','echo.audio.private.send','go.public.read'],echoAdmin:['echo.admin.write'],central:['ops.summary.read'],statsReader:['stats.private.read']};
const unsafe = new Set(['resourceMismatch','sessionExpired','sessionStale','roleStale','permissionStale','issuerMismatch','audienceMismatch','appMismatch','actionMismatch','resourceStale','sourceStale','revocationStale','restoreStale','identityUnknown','resourceUnknown','nonceReplay','revokeAtSend','sourceAtSend','permissionAtSend','adminRace','evidenceConflict','proofExpired','aiUnknown','backupHold','pwaStale','headUnknown','sameApprover']);
function decide(actor, action, flag) {
  if (unsafe.has(flag)) return {decision:'DENY', downstreamReads:0, privateBytes:0};
  if (!grants[actor]?.includes(action)) return {decision:'DENY', downstreamReads:0, privateBytes:0};
  return {decision:'ALLOW',downstreamReads:action==='ops.summary.read'?1:0,privateBytes:0};
}
for (const [name,actor,action,expected,flag] of fixtures) {
  test(name,()=>{
    const result=decide(actor,action,flag);
    assert.equal(result.decision,expected);
    if(expected==='DENY'){assert.equal(result.downstreamReads,0);assert.equal(result.privateBytes,0);}
  });
}
test('2000 ordinary members denied without downstream reads',()=>{
  const results=Array.from({length:2000},()=>decide('member','ops.summary.read','bulk2000'));
  assert.equal(results.filter(r=>r.decision==='DENY'&&r.downstreamReads===0).length,2000);
});
test('four domains cannot unlock each other',()=>{
  for(const flag of ['aiUnknown','backupHold','evidenceConflict','headUnknown']) {
    assert.equal(decide('central','ai.provider.send',flag).decision,'DENY');
  }
});
test('revocation at send is rejected regardless of earlier ALLOW',()=>{
  assert.equal(decide('member','echo.audio.private.read').decision,'ALLOW');
  assert.equal(decide('member','echo.audio.private.send','revokeAtSend').decision,'DENY');
});
