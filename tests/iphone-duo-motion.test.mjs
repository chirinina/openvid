import test from 'node:test';
import assert from 'node:assert/strict';
import { supports3DMotionPreset, sampleMockup3DMotion, sampleCombined3DMotion, sample3DFragmentMotion, DEFAULT_3D_MOTION_CUSTOM_OFFSETS, getDefault3DFragmentDuration } from '../lib/mockup-motion-3d.ts';
import { foldChoreography } from '../lib/iphone-duo/fold-choreography.ts';

const fragment = (presetId, startTime = 0, endTime = 2) => ({ id: presetId, presetId, startTime, endTime, intensity: 50, speed: 50 });

test('fold choreography clamps both endpoints and keeps the hinge in range', () => {
  assert.equal(foldChoreography(-1).angle, Math.PI);
  assert.equal(foldChoreography(2).angle, 0);
  for (let p = 0; p <= 1; p += 0.01) {
    const { angle } = foldChoreography(p);
    assert.ok(angle >= 0 && angle <= Math.PI);
  }
});

test('unfold and fold finish at their intended endpoints at every speed', () => {
  for (const speed of [0, 50, 100]) {
    for (const intensity of [0, 50, 100]) {
      for (const [presetId, from, to] of [['duo-unfold', 0, 1], ['duo-fold', 1, 0]]) {
        const config = { presetId, speed, intensity };
        assert.equal(sampleMockup3DMotion(config, 0, 2).openingProgress, from);
        assert.equal(sampleMockup3DMotion(config, 2, 2).openingProgress, to);
        let previous = from;
        for (let frame = 0; frame <= 60; frame++) {
          const pose = sampleMockup3DMotion(config, frame / 30, 2);
          assert.ok(pose.openingProgress >= 0 && pose.openingProgress <= 1);
          assert.ok(to > from ? pose.openingProgress >= previous : pose.openingProgress <= previous);
          assert.ok(Object.values(pose).every(Number.isFinite));
          previous = pose.openingProgress;
        }
      }
    }
  }
});

test('cycle starts open, closes at the middle, and ends open', () => {
  const f = fragment('duo-cycle', 0, 4);
  assert.equal(sample3DFragmentMotion(f, 0).openingProgress, 1);
  assert.equal(sample3DFragmentMotion(f, 2).openingProgress, 0);
  assert.equal(sample3DFragmentMotion(f, 4).openingProgress, 1);
});

test('folded pose is retained through gaps and unrelated motion', () => {
  const fragments = [fragment('duo-fold'), fragment('float-hold', 3, 6), fragment('duo-unfold', 7, 9)];
  assert.equal(sampleCombined3DMotion(fragments, 2.5).openingProgress, 0);
  assert.equal(sampleCombined3DMotion(fragments, 4).openingProgress, 0);
  assert.equal(sampleCombined3DMotion(fragments, 10).openingProgress, 1);
  assert.equal(sampleCombined3DMotion(fragments, -1).openingProgress, undefined);
});

test('random scrubbing and serialized project restore match sequential export sampling', () => {
  const fragments = [fragment('duo-fold'), fragment('duo-unfold', 3, 5)];
  const restored = JSON.parse(JSON.stringify(fragments));
  const frames = Array.from({ length: 181 }, (_, i) => sampleCombined3DMotion(fragments, i / 30));
  for (const i of [180, 0, 110, 60, 89, 32, 150, 20]) {
    assert.deepEqual(sampleCombined3DMotion(restored, i / 30), frames[i]);
  }
});

test('reverse flips the fold direction and remains held after the fragment', () => {
  const f = { ...fragment('duo-unfold'), custom3D: { ...DEFAULT_3D_MOTION_CUSTOM_OFFSETS, reverse: true } };
  assert.equal(sample3DFragmentMotion(f, 0).openingProgress, 1);
  assert.equal(sample3DFragmentMotion(f, 2).openingProgress, 0);
  assert.equal(sampleCombined3DMotion([f], 3).openingProgress, 0);
});

test('ordinary devices and empty timelines keep manual opening untouched', () => {
  assert.equal(sampleCombined3DMotion([], 3).openingProgress, undefined);
  assert.equal(sampleCombined3DMotion([fragment('orbit-entrance')], 1).openingProgress, undefined);
  assert.equal(sampleMockup3DMotion(fragment('duo-unfold'), 0, 0).openingProgress, undefined);
  assert.equal(getDefault3DFragmentDuration('duo-unfold', 50), 2);
  assert.equal(getDefault3DFragmentDuration('duo-cycle', 50), 4);
});

test('fold presets cannot animate a different device', () => {
  for (const preset of ['duo-unfold', 'duo-fold', 'duo-cycle']) {
    assert.equal(supports3DMotionPreset(preset, 'iphone-duo'), true);
    assert.equal(supports3DMotionPreset(preset, 'laptop'), false);
    assert.equal(supports3DMotionPreset(preset, 'iphone-13-pro-max'), false);
  }
  assert.equal(supports3DMotionPreset('orbit-entrance', 'iphone-duo'), true);
});
