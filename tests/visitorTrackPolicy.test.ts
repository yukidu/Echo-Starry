import test from 'node:test';
import assert from 'node:assert/strict';
import {isVisibleOnGuestHome, canGuestPlayPublicShare} from '../src/visitorTrackPolicy';

test('guest home lists public recordings and explicitly visible restricted recordings',()=>{
  assert.equal(isVisibleOnGuestHome({requiredRank:'無'}),true);
  assert.equal(isVisibleOnGuestHome({requiredRank:'公開'}),true);
  assert.equal(isVisibleOnGuestHome({requiredRank:'白金'}),false);
  assert.equal(isVisibleOnGuestHome({requiredRank:'白金',guestVisible:true}),true);
  assert.equal(isVisibleOnGuestHome({requiredRank:'白金',guestVisible:false}),false);
  assert.equal(isVisibleOnGuestHome({requiredRank:'無',isPrivateVip:true}),false);
});
test('listing visibility never grants restricted playback; only guest public share detail permits direct playback',()=>{
  assert.equal(canGuestPlayPublicShare({requiredRank:'白金',guestVisible:true},true,true),false);
  assert.equal(canGuestPlayPublicShare({requiredRank:'無',isPrivateVip:true},true,true),false);
  assert.equal(canGuestPlayPublicShare({requiredRank:'無'},true,true),true);
  assert.equal(canGuestPlayPublicShare({requiredRank:'無'},true,false),false);
  assert.equal(canGuestPlayPublicShare({requiredRank:'無'},false,true),false);
});
