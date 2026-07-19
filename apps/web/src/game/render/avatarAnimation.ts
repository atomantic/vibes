export type AvatarAnimationState = 'idle' | 'walk' | 'run' | 'jump';

const IDLE_ENTER_SPEED_METERS_PER_SECOND = 0.1;
const IDLE_EXIT_SPEED_METERS_PER_SECOND = 0.2;
const RUN_ENTER_SPEED_METERS_PER_SECOND = 4.2;
const RUN_EXIT_SPEED_METERS_PER_SECOND = 3.8;
const NATURAL_WALK_SPEED_METERS_PER_SECOND = 2.4;
const NATURAL_RUN_SPEED_METERS_PER_SECOND = 5.5;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function selectAvatarAnimation(
  grounded: boolean,
  horizontalSpeedMetersPerSecond: number,
  previousState: AvatarAnimationState = 'idle',
): AvatarAnimationState {
  if (!grounded) return 'jump';

  const speed = Number.isFinite(horizontalSpeedMetersPerSecond)
    ? Math.max(0, horizontalSpeedMetersPerSecond)
    : 0;
  const idleThreshold =
    previousState === 'idle'
      ? IDLE_EXIT_SPEED_METERS_PER_SECOND
      : IDLE_ENTER_SPEED_METERS_PER_SECOND;
  if (speed < idleThreshold) return 'idle';
  const runThreshold =
    previousState === 'run' ? RUN_EXIT_SPEED_METERS_PER_SECOND : RUN_ENTER_SPEED_METERS_PER_SECOND;
  if (speed < runThreshold) return 'walk';
  return 'run';
}

export function avatarAnimationPlaybackRate(
  state: AvatarAnimationState,
  horizontalSpeedMetersPerSecond: number,
): number {
  const speed = Number.isFinite(horizontalSpeedMetersPerSecond)
    ? Math.max(0, horizontalSpeedMetersPerSecond)
    : 0;

  switch (state) {
    case 'walk':
      return clamp(speed / NATURAL_WALK_SPEED_METERS_PER_SECOND, 0.65, 1.45);
    case 'run':
      return clamp(speed / NATURAL_RUN_SPEED_METERS_PER_SECOND, 0.85, 1.5);
    case 'idle':
    case 'jump':
      return 1;
  }
}
