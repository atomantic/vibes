export const FIXED_TICK_RATE = 30;
export const SIMULATION_TICK_RATE = FIXED_TICK_RATE;
export const FIXED_STEP_SECONDS = 1 / FIXED_TICK_RATE;
export const GRAVITY_METERS_PER_SECOND_SQUARED = -24;

export const PLAYER_ENTITY_ID = 'player.local';
export const PLAYER_CAPSULE_RADIUS = 0.45;
export const PLAYER_CAPSULE_HALF_HEIGHT = 0.65;
export const PLAYER_STANDING_HALF_HEIGHT = PLAYER_CAPSULE_RADIUS + PLAYER_CAPSULE_HALF_HEIGHT;

export const RUN_SPEED_METERS_PER_SECOND = 5.5;
export const SPRINT_SPEED_METERS_PER_SECOND = 8;
export const JUMP_SPEED_METERS_PER_SECOND = 8.5;

/** Falling speed at which holding Jump engages the glide. */
export const GLIDE_ENGAGE_FALL_SPEED_METERS_PER_SECOND = -1.5;
/** Vertical speed the glide slows a fall to. */
export const GLIDE_TERMINAL_FALL_SPEED_METERS_PER_SECOND = 2.4;
/** Horizontal multiplier applied to steering input while gliding. */
export const GLIDE_FORWARD_BOOST = 1.15;

/** Radius in which an Echo Shard resonates with the player and is collected. */
export const ECHO_SHARD_RADIUS_METERS = 2.6;

export const COYOTE_TICKS = 3;
export const JUMP_BUFFER_TICKS = 4;
export const WORLD_CELL_SIZE_METERS = 64;
