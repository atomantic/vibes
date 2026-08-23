import type { EchoShardKey } from '@vibes/world';

export function newlyCollectedEchoShards(
  previous: readonly EchoShardKey[],
  current: readonly EchoShardKey[],
): readonly EchoShardKey[] {
  const previousSet = new Set(previous);
  return current.filter((key) => !previousSet.has(key));
}
