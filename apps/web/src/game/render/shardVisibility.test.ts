import { describe, expect, it } from 'vitest';

import { newlyCollectedEchoShards } from './shardVisibility';

describe('newlyCollectedEchoShards', () => {
  it('detects a replacement even when the collection length is unchanged', () => {
    expect(newlyCollectedEchoShards(['tidepool'], ['ledge'])).toEqual(['ledge']);
  });

  it('does not replay effects for an unchanged collection or a reset', () => {
    expect(newlyCollectedEchoShards(['tidepool', 'pond'], ['tidepool', 'pond'])).toEqual([]);
    expect(newlyCollectedEchoShards(['tidepool', 'pond'], [])).toEqual([]);
  });
});
