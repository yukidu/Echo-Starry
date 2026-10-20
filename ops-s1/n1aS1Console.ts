/**
 * N1A-S1 AI6: OFFLINE-ONLY four-domain safety console.
 * Fake verified is NOT Starry ID membership, SecurityProof, Cloudflare
 * availability or an independently witnessed rollback anchor.
 */
import { buildDashboard } from './healthModel.ts';
import type { Dashboard, HealthStatus, Observation } from './healthModel.ts';
import type { SyntheticInput, SyntheticKind, SyntheticOrigin } from './syntheticEvents.ts';

export const N1A_DOMAINS = ['cloud_platform', 'app_security', 'ai_billing', 'backup_restore'] as const;
export type N1aDomain = typeof N1A_DOMAINS[number];
export type BusinessDomain = Exclude<N1aDomain, 'cloud_platform'>;
type SourceRule = Readonly<{domain:BusinessDomain;origin:SyntheticOrigin;level:'warning'|'fault';code:string}>;
const RULES: Readonly<Record<SyntheticKind,SourceRule>> = {
 dispatch_uncertain:{domain:'app_security',origin:'ai2',level:'warning',code:'APP_QUEUE_UNCONFIRMED'},
 processing_timeout:{domain:'app_security',origin:'ai2',level:'warning',code:'APP_TRANSCRIPT_TIMEOUT'},
 workflow_failed:{domain:'app_security',origin:'ai2',level:'fault',code:'APP_TRANSCRIPT_FAILED'},
 b07_uncertain_hold:{domain:'ai_billing',origin:'ai3',level:'warning',code:'BILLING_UNCERTAIN_HOLD'},
 b07_stop_new_spend:{domain:'ai_billing',origin:'ai3',level:'warning',code:'BILLING_SPENDING_LOCKED'},
 backup_anomaly:{domain:'backup_restore',origin:'ai7',level:'warning',code:'BACKUP_CHAIN_UNCONFIRMED'},
 restore_locked:{domain:'backup_restore',origin:'ai7',level:'warning',code:'RESTORE_LOCKED'},
 backup_integrity_fault:{domain:'backup_restore',origin:'ai7',level:'fault',code:'BACKUP_INTEGRITY_FAILED'},
};
const BUSINESS: readonly BusinessDomain[]=['app_security','ai_billing','backup_restore'];
const MAX_EVENTS=4096,MAX_AGE=15*60_000;

export type MockPositiveCheck = {domain:BusinessDomain;observedAt:string;fixtureComplete:boolean;fixtureConfirmsNoIncidents:boolean};
export type DomainCard = {
 domain:BusinessDomain;status:HealthStatus;conflict:boolean;reasonCode:string;
 observedAt:string|null;evidence:'simulated'|'missing';locked:true;productionAuthorized:false;
};
export type AnonymousIncident = {domain:BusinessDomain;code:string;status:HealthStatus;count:number;observedAt:string|null};
export type N1aMockDashboard = {
 mode:'offline_mock_only';cloud:Dashboard;
 domains:{app_security:DomainCard;ai_billing:DomainCard;backup_restore:DomainCard};
 incidents:AnonymousIncident[];anyConfirmedFault:boolean;anyUnknown:boolean;showUnverifiedBanner:true;
 actionsAllowed:false;retriesAllowed:false;newAiSpendingAllowed:false;restoreAllowed:false;productionAuthorized:false;
};

function fresh(time:unknown,now:number):number|null {
 if(typeof time!=='string'||time.length>35||!Number.isFinite(now))return null;
 const t=Date.parse(time);return Number.isFinite(t)&&t<=now&&now-t<=MAX_AGE?t:null;
}
const stamp=(n:number|null)=>n===null?null:new Date(n).toISOString();

/** Pure, finite, fake input only; never access network, database, or models. */
export function buildN1aMockDashboard(
 platformFixtures:readonly Observation[], events:readonly SyntheticInput[], nowMs:number,
 positives:readonly MockPositiveCheck[]=[],
 options:{cloudSourceAvailable?:boolean;eventSourceAvailable?:boolean;positiveSourceAvailable?:boolean}={},
):N1aMockDashboard {
 // Crucial: no AI2/AI3/AI7 event is ever passed to Cloudflare platform health.
 const cloud=buildDashboard(options.cloudSourceAvailable===false?[]:platformFixtures,nowMs);
 type Mutable={warnings:number;faults:number;unknowns:number;positives:number;
  newest:number|null;codes:Map<string,{count:number;status:HealthStatus;newest:number|null}>};
 const groups=new Map<BusinessDomain,Mutable>(BUSINESS.map(d=>[d,{
  warnings:0,faults:0,unknowns:0,positives:0,newest:null,codes:new Map(),
 }]));
 const overflow=events.length>MAX_EVENTS;
 for(const item of events.slice(0,MAX_EVENTS)) {
  if(!item||typeof item.kind!=='string'||!Object.prototype.hasOwnProperty.call(RULES,item.kind)){
    for(const d of BUSINESS)groups.get(d)!.unknowns++;
    continue;
  }
  const rule=RULES[item.kind as SyntheticKind], group=groups.get(rule.domain)!;
  const observed=fresh(item.observedAt,nowMs);
  const usable=options.eventSourceAvailable!==false&&item.origin===rule.origin&&item.verified===true&&observed!==null;
  const status:HealthStatus=usable?rule.level:'unknown';
  if(status==='fault')group.faults++;
  else if(status==='warning')group.warnings++;
  else group.unknowns++;
  if(observed!==null)group.newest=Math.max(group.newest??observed,observed);
  const key=rule.code+':'+status, prior=group.codes.get(key);
  group.codes.set(key,{count:(prior?.count??0)+1,status,
    newest:observed===null?(prior?.newest??null):Math.max(prior?.newest??observed,observed)});
 }
 if(overflow||options.eventSourceAvailable===false||options.positiveSourceAvailable===false) {
  for(const d of BUSINESS)groups.get(d)!.unknowns++;
 }
 for(const item of positives) {
  if(!item||!BUSINESS.includes(item.domain))continue;
  const g=groups.get(item.domain)!,when=fresh(item.observedAt,nowMs);
  if(options.positiveSourceAvailable===false||!item.fixtureComplete||
     !item.fixtureConfirmsNoIncidents||when===null)g.unknowns++;
  else{g.positives++;g.newest=Math.max(g.newest??when,when);}
 }
 function card(domain:BusinessDomain):DomainCard {
  const g=groups.get(domain)!;
  const conflict=(g.faults>0&&(g.warnings>0||g.unknowns>0||g.positives>0))||
    (g.warnings>0&&(g.unknowns>0||g.positives>0))||
    (g.positives>0&&g.unknowns>0);
  const status:HealthStatus=g.faults>0?'fault':g.unknowns>0?'unknown':
    g.warnings>0&&g.positives===0?'warning':
    g.warnings>0&&g.positives>0?'unknown':g.positives>0?'normal':'unknown';
  const reasonCode=status==='fault'?'CONFIRMED_FAKE_INCIDENT':
    conflict?'CONFLICT_REVIEW_REQUIRED':status==='warning'?'FAKE_PROTECTION_WARNING':
    status==='normal'?'COMPLETE_FAKE_EVIDENCE':'INSUFFICIENT_EVIDENCE';
  return {domain,status,conflict,reasonCode,observedAt:stamp(g.newest),
   evidence:status==='unknown'?'missing':'simulated',locked:true,productionAuthorized:false};
 }
 const domains={app_security:card('app_security'),ai_billing:card('ai_billing'),backup_restore:card('backup_restore')};
 const incidents:AnonymousIncident[]=[];
 for(const domain of BUSINESS)for(const [key,value] of groups.get(domain)!.codes){
  incidents.push({domain,code:key.split(':')[0],status:value.status,count:value.count,observedAt:stamp(value.newest)});
 }
 incidents.sort((a,b)=>a.domain.localeCompare(b.domain)||a.code.localeCompare(b.code)||a.status.localeCompare(b.status));
 return {mode:'offline_mock_only',cloud,domains,incidents:incidents.slice(0,25),
  anyConfirmedFault:cloud.overall==='fault'||BUSINESS.some(d=>domains[d].status==='fault'),
  anyUnknown:cloud.partialUnknown||BUSINESS.some(d=>domains[d].status==='unknown'),
  showUnverifiedBanner:true,actionsAllowed:false,retriesAllowed:false,newAiSpendingAllowed:false,
  restoreAllowed:false,productionAuthorized:false};
}
export const buildUnknownN1aMock=(now:number):N1aMockDashboard=>
 buildN1aMockDashboard([],[],now,[],{cloudSourceAvailable:false,eventSourceAvailable:false,positiveSourceAvailable:false});
