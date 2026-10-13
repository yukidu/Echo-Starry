import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cropModal = readFileSync(new URL('../src/components/AvatarCropModal.tsx', import.meta.url), 'utf8');
const profileModal = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');

test('v215: avatar editor uses a real square crop selector instead of moving or zooming the photo', () => {
  assert.match(cropModal, /type CropBox/);
  assert.match(cropModal, /data-avatar-crop-frame="true"/);
  assert.match(cropModal, /onPointerDown=\{handleCropPointerDown\}/);
  assert.match(cropModal, /onPointerMove=\{handleCropPointerMove\}/);
  assert.match(cropModal, /onPointerUp=\{handleCropPointerEnd\}/);
  assert.match(cropModal, /touch-none/);
  assert.match(cropModal, /裁切框大小/);
  assert.match(cropModal, /照片本身不再移動或放大/);
  assert.doesNotMatch(cropModal, /setZoom|\bzoom\b|setPan|\bpan\b|onMouseDown|onMouseMove/);
  assert.doesNotMatch(cropModal, /transform:\s*`translate/);
});

test('v215: crop result is generated from the selected source rectangle and keeps existing profile update flow', () => {
  assert.match(cropModal, /ctx\.drawImage\([\s\S]*cropBox\.x,[\s\S]*cropBox\.y,[\s\S]*cropBox\.size,[\s\S]*cropBox\.size/s);
  assert.match(cropModal, /canvas\.toDataURL\('image\/jpeg', 0\.85\)/);
  assert.match(cropModal, /onCropComplete\(compressedDataUrl\)/);
  assert.match(profileModal, /onCropComplete=\{handleAvatarCropped\}/);
  assert.match(profileModal, /avatarUploadCount:\s*currentUploadCount \+ 1/);
});
