import test from 'node:test';
import assert from 'node:assert/strict';
import { moveTrackIdToSecondSlot, sortDefaultHomeTracks, sortStickerTracks } from '../src/homePlaylistPolicy';

type MockTrack = {
  id: string;
  isPrivateVip?: boolean;
  requiredRank: number;
  uploadedAt: number;
  sequence: number;
  canAccess: boolean;
};

const options = (seed: number) => ({
  canAccess: (track: MockTrack) => track.canAccess,
  getRequiredRankIndex: (track: MockTrack) => track.requiredRank,
  getUploadTimestamp: (track: MockTrack) => track.uploadedAt,
  getUploadSequence: (track: MockTrack) => track.sequence,
  shuffleSeed: seed
});

test('default home order keeps playable first, locked low-rank to high-rank second, VIP newest first third', () => {
  const tracks: MockTrack[] = [
    { id: 'locked-high', requiredRank: 5, uploadedAt: 9, sequence: 9, canAccess: false },
    { id: 'vip-old', isPrivateVip: true, requiredRank: 0, uploadedAt: 2, sequence: 2, canAccess: true },
    { id: 'play-a', requiredRank: 0, uploadedAt: 1, sequence: 1, canAccess: true },
    { id: 'locked-low', requiredRank: 2, uploadedAt: 1, sequence: 1, canAccess: false },
    { id: 'vip-new', isPrivateVip: true, requiredRank: 0, uploadedAt: 8, sequence: 8, canAccess: true },
    { id: 'play-b', requiredRank: 1, uploadedAt: 5, sequence: 5, canAccess: true }
  ];

  const sorted = sortDefaultHomeTracks(tracks, options(123));
  const ids = sorted.map(track => track.id);
  const playable = ids.slice(0, 2);

  assert.deepEqual(new Set(playable), new Set(['play-a', 'play-b']));
  assert.deepEqual(ids.slice(2, 4), ['locked-low', 'locked-high']);
  assert.deepEqual(ids.slice(4), ['vip-new', 'vip-old']);
});

test('playable order is stable for one seed and changes when the home-entry seed changes', () => {
  const tracks: MockTrack[] = Array.from({ length: 10 }, (_, index) => ({
    id: `play-${index}`,
    requiredRank: 0,
    uploadedAt: index,
    sequence: index,
    canAccess: true
  }));

  const first = sortDefaultHomeTracks(tracks, options(101)).map(track => track.id);
  const same = sortDefaultHomeTracks(tracks, options(101)).map(track => track.id);
  const nextEntry = sortDefaultHomeTracks(tracks, options(202)).map(track => track.id);

  assert.deepEqual(first, same);
  assert.notDeepEqual(first, nextEntry);
});

test('lucky draw moves the highlighted candidate to the first card without losing tracks', () => {
  const source = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveTrackIdToSecondSlot(source, 'd'), ['d', 'a', 'b', 'c']);
  assert.deepEqual(source, ['a', 'b', 'c', 'd']);
  assert.deepEqual(moveTrackIdToSecondSlot(['only'], 'only'), ['only']);
});


test('sticker sorting keeps actual purchases first and switches between cost ascending and reward descending',()=>{
 const tracks=[{id:'free-low',stickerUnlockCost:0,commentStickerReward:1},{id:'paid-high',stickerUnlockCost:9,commentStickerReward:2},{id:'locked',stickerUnlockCost:3,commentStickerReward:8},{id:'paid-low',stickerUnlockCost:2,commentStickerReward:6}];
 const purchased=['paid-high','paid-low'];
 assert.deepEqual(sortStickerTracks(tracks,purchased,'cost').map(t=>t.id),['paid-low','paid-high','free-low','locked']);
 assert.deepEqual(sortStickerTracks(tracks,purchased,'reward').map(t=>t.id),['paid-low','paid-high','locked','free-low']);
 assert.deepEqual(sortStickerTracks(tracks,[],'cost').map(t=>t.id),['free-low','paid-low','locked','paid-high']);
 assert.equal(tracks[0].id,'free-low');
});