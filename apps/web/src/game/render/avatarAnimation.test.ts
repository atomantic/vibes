import { describe, expect, it } from 'vitest';

import { avatarAnimationPlaybackRate, selectAvatarAnimation } from './avatarAnimation';

describe('selectAvatarAnimation', () => {
  it('gives airborne motion priority over horizontal speed', () => {
    expect(selectAvatarAnimation(false, 0)).toBe('jump');
    expect(selectAvatarAnimation(false, 8)).toBe('jump');
  });

  it('uses idle, walk, and run for grounded speed ranges', () => {
    expect(selectAvatarAnimation(true, 0)).toBe('idle');
    expect(selectAvatarAnimation(true, 0.14)).toBe('idle');
    expect(selectAvatarAnimation(true, 2.4)).toBe('walk');
    expect(selectAvatarAnimation(true, 5.5)).toBe('run');
    expect(selectAvatarAnimation(true, 8)).toBe('run');
  });

  it('uses hysteresis to avoid gamepad animation jitter at state boundaries', () => {
    expect(selectAvatarAnimation(true, 0.16, 'idle')).toBe('idle');
    expect(selectAvatarAnimation(true, 0.16, 'walk')).toBe('walk');
    expect(selectAvatarAnimation(true, 4, 'walk')).toBe('walk');
    expect(selectAvatarAnimation(true, 4, 'run')).toBe('run');
  });

  it('treats invalid or negative speed as stationary', () => {
    expect(selectAvatarAnimation(true, Number.NaN)).toBe('idle');
    expect(selectAvatarAnimation(true, -4)).toBe('idle');
  });
});

describe('avatarAnimationPlaybackRate', () => {
  it('tracks travel speed while keeping locomotion playback bounded', () => {
    expect(avatarAnimationPlaybackRate('walk', 1.2)).toBe(0.65);
    expect(avatarAnimationPlaybackRate('walk', 2.4)).toBe(1);
    expect(avatarAnimationPlaybackRate('run', 5.5)).toBe(1);
    expect(avatarAnimationPlaybackRate('run', 8)).toBeCloseTo(8 / 5.5);
    expect(avatarAnimationPlaybackRate('run', 100)).toBe(1.5);
  });

  it('keeps idle and jump clips at authored speed', () => {
    expect(avatarAnimationPlaybackRate('idle', 0)).toBe(1);
    expect(avatarAnimationPlaybackRate('jump', 8)).toBe(1);
  });
});
