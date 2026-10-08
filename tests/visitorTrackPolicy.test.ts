import test from 'node:test';
import assert from 'node:assert/strict';
import {isVisibleOnGuestHome, canGuestPlayPublicShare} from '../src/visitorTrackPolicy';

test('guest home only lists public zero-sticker recordings',()=>{
  assert.equal(isVisibleOnGuestHome({requiredRank:'無',stickerUnlockCost:0}),true);
  assert.equal(isVisibleOnGuestHome({requiredRank:'公開',stickerUnlockCost:0}),true);
  assert.equal(isVisibleOnGuestHome({requiredRank:'公開',stickerUnlockCost:1}),false);
  assert.equal(isVisibleOnGuestHome({requiredRank:'白金',guestVisible:true,stickerUnlockCost:0}),false);
  assert.equal(isVisibleOnGuestHome({requiredRank:'白金',guestVisible:false,stickerUnlockCost:0}),false);
  assert.equal(isVisibleOnGuestHome({requiredRank:'無',isPrivateVip:true,stickerUnlockCost:0}),false);
});

test('guest public share playback remains separate from the guest home listing filter',()=>{
  assert.equal(canGuestPlayPublicShare({requiredRank:'白金',guestVisible:true},true,true),false);
  assert.equal(canGuestPlayPublicShare({requiredRank:'無',isPrivateVip:true},true,true),false);
  assert.equal(canGuestPlayPublicShare({requiredRank:'無',stickerUnlockCost:5},true,true),true);
  assert.equal(canGuestPlayPublicShare({requiredRank:'無'},true,false),false);
  assert.equal(canGuestPlayPublicShare({requiredRank:'無'},false,true),false);
});
