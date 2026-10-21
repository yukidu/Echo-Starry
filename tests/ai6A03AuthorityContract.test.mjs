// AI6 A03: isolated contract prototype. Not wired to production Starry ID or Workers.
// All identities, clocks, resources and revisions are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';

class Authority {
  constructor() { this.now=1000; this.sessions=new Map(); this.resources=new Map(); this.claims=new Set(); }
  issue(subject, app, actions, ttl=100) {
    const id=`${subject}:${app}`;
    const previous=this.sessions.get(id);
    const s={id,subject,app,actions:new Set(actions),sessionRevision:(previous?.sessionRevision??0)+1,permissionRevision:(previous?.permissionRevision??0)+1,roleRevision:1,expiresAt:this.now+ttl,revoked:false};
    this.sessions.set(id,s); return {...s,actions:new Set(s.actions)};
  }
  resource(app,id,owner) {
    const r={app,id,owner,resourceRevision:1,sourceRevision:1,revocationWatermark:0,restoreEpoch:1,deleted:false};
    this.resources.set(`${app}:${id}`,r); return {...r};
  }
  revoke(subject,app) {const s=this.sessions.get(`${subject}:${app}`);if(s){s.revoked=true;s.permissionRevision++;}}
  mutateResource(app,id,changes) {const r=this.resources.get(`${app}:${id}`);Object.assign(r,changes);r.resourceRevision++;}
  authorize({session,app,action,resource,proof,nonce,issuer='starry-id',audience='starry-services'}) {
    const deny=(reason)=>({decision:'DENY',reason,privateBytes:0});
    if(issuer!=='starry-id'||audience!=='starry-services'||!nonce) return deny('BAD_ENVELOPE');
    const live=this.sessions.get(session?.id);
    if(!live||live.revoked||this.now>=live.expiresAt||this.now>=session.expiresAt) return deny('SESSION_INVALID');
    if(live.subject!==session.subject||live.app!==app||session.app!==app) return deny('APP_MISMATCH');
    if(['sessionRevision','permissionRevision','roleRevision'].some(k=>live[k]!==session[k])) return deny('STALE_IDENTITY');
    if(!live.actions.has(action)||!session.actions.has(action)) return deny('ACTION_DENIED');
    if(!resource||resource.app!==app) return deny('RESOURCE_APP_MISMATCH');
    const current=this.resources.get(`${app}:${resource.id}`);
    if(!current||current.deleted||current.owner!==session.subject) return deny('RESOURCE_DENIED');
    if(!proof||this.now>=proof.expiresAt) return deny('PROOF_EXPIRED');
    for(const key of ['resourceRevision','sourceRevision','revocationWatermark','restoreEpoch']) {
      if(current[key]!==proof[key]) return deny('STALE_RESOURCE');
    }
    return {decision:'ALLOW',reason:'CURRENT_AUTHORITY',privateBytes:0};
  }
  sendOnce(request) {
    const auth=this.authorize(request);
    if(auth.decision!=='ALLOW') return auth;
    const key=`${request.app}:${request.resource.id}:${request.nonce}`;
    if(this.claims.has(key)) return {decision:'DENY',reason:'REPLAY',privateBytes:0};
    this.claims.add(key);
    return {decision:'ALLOW',reason:'CLAIMED',privateBytes:0};
  }
}
function setup(app='echo') {
  const a=new Authority(), session=a.issue('member-1',app,['private.read','private.send']);
  const resource=a.resource(app,'audio-1','member-1');
  const proof={...resource,expiresAt:1050};
  return {a,session,resource,proof,request:{session,app,action:'private.read',resource,proof,nonce:'n-1'}};
}
test('current session and matching resource may read',()=>{const {a,request}=setup();assert.equal(a.authorize(request).decision,'ALLOW');});
test('cross-App token is denied',()=>{const {a,request}=setup();assert.equal(a.authorize({...request,app:'download'}).decision,'DENY');});
test('cross-App resource is denied',()=>{const {a,request}=setup();assert.equal(a.authorize({...request,resource:{...request.resource,app:'download'}}).decision,'DENY');});
test('resource ownership is checked by authority',()=>{const {a,request}=setup();a.mutateResource('echo','audio-1',{owner:'member-2'});assert.equal(a.authorize(request).decision,'DENY');});
test('session expiry is checked against synthetic clock',()=>{const {a,request}=setup();a.now=1101;assert.equal(a.authorize(request).decision,'DENY');});
test('proof expiry is checked against synthetic clock',()=>{const {a,request}=setup();a.now=1050;assert.equal(a.authorize(request).decision,'DENY');});
test('permission revision invalidates old session',()=>{const {a,request}=setup();a.sessions.get(request.session.id).permissionRevision++;assert.equal(a.authorize(request).decision,'DENY');});
test('role revision invalidates old session',()=>{const {a,request}=setup();a.sessions.get(request.session.id).roleRevision++;assert.equal(a.authorize(request).decision,'DENY');});
test('session revision invalidates old session',()=>{const {a,request}=setup();a.sessions.get(request.session.id).sessionRevision++;assert.equal(a.authorize(request).decision,'DENY');});
test('revocation invalidates session',()=>{const {a,request}=setup();a.revoke('member-1','echo');assert.equal(a.authorize(request).decision,'DENY');});
test('source changes invalidate resource proof',()=>{const {a,request}=setup();a.mutateResource('echo','audio-1',{sourceRevision:2});assert.equal(a.authorize(request).decision,'DENY');});
test('revocation watermark changes invalidate proof',()=>{const {a,request}=setup();a.mutateResource('echo','audio-1',{revocationWatermark:2});assert.equal(a.authorize(request).decision,'DENY');});
test('restore epoch changes invalidate proof',()=>{const {a,request}=setup();a.mutateResource('echo','audio-1',{restoreEpoch:2});assert.equal(a.authorize(request).decision,'DENY');});
test('deleted resource is denied',()=>{const {a,request}=setup();a.mutateResource('echo','audio-1',{deleted:true});assert.equal(a.authorize(request).decision,'DENY');});
test('issuer audience nonce are required',()=>{const {a,request}=setup();for(const change of [{issuer:'unknown'},{audience:'other'},{nonce:''}])assert.equal(a.authorize({...request,...change}).decision,'DENY');});
test('unknown action is denied',()=>{const {a,request}=setup();assert.equal(a.authorize({...request,action:'admin.export'}).decision,'DENY');});
test('revocation between read and SEND blocks SEND',()=>{const {a,request}=setup();assert.equal(a.authorize(request).decision,'ALLOW');a.revoke('member-1','echo');assert.equal(a.sendOnce({...request,action:'private.send'}).decision,'DENY');});
test('resource changed between read and SEND blocks SEND',()=>{const {a,request}=setup();assert.equal(a.authorize(request).decision,'ALLOW');a.mutateResource('echo','audio-1',{revocationWatermark:1});assert.equal(a.sendOnce({...request,action:'private.send'}).decision,'DENY');});
test('single-use SEND claim rejects replay',()=>{const {a,request}=setup();const send={...request,action:'private.send'};assert.equal(a.sendOnce(send).decision,'ALLOW');assert.equal(a.sendOnce(send).decision,'DENY');});
test('independent App permissions do not leak',()=>{const {a,request}=setup();const download=a.issue('member-1','download',['private.read']);const d=a.resource('download','audio-2','member-1');const p={...d,expiresAt:1050};assert.equal(a.authorize({...request,session:download,app:'download',resource:d,proof:p}).decision,'ALLOW');assert.equal(a.authorize({...request,session:download,app:'echo'}).decision,'DENY');});
test('missing authority evidence fails closed without bytes',()=>{const {a,request}=setup();for(const proof of [undefined,null,{}]){const result=a.authorize({...request,proof});assert.equal(result.decision,'DENY');assert.equal(result.privateBytes,0);}});
