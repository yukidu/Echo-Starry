import test from 'node:test';
import assert from 'node:assert/strict';
import { METEOR_REWARD_HUNDREDTHS, meteorRewardHundredths } from '../shared/meteorReward';

test('twelve visibly sized meteor tiers award 1.00 down to 0.01', () => {
  assert.equal(METEOR_REWARD_HUNDREDTHS.length,12);
  assert.equal(meteorRewardHundredths(1),100);
  for(let level=2;level<=12;level++){
    assert.equal(meteorRewardHundredths(level),13-level);
  }
  for(let i=1;i<11;i++){
    assert.ok(METEOR_REWARD_HUNDREDTHS[i]>METEOR_REWARD_HUNDREDTHS[i+1]);
  }
});
test('reject invalid and client-invented size levels',()=>{
  for (const value of [0,13,-1,1.4,'1','12',null,undefined,NaN,Infinity,{}]) {
    assert.equal(meteorRewardHundredths(value),null);
  }
});
