/** Presentation only. Keys are persistent equipment IDs; values are original-game artwork/name pairs. */
export const equipmentArtVersion = 1 as const;
export const equipmentArtIds: Readonly<Record<string, string>> = {
  relic_014: 'relic_003', relic_034: 'relic_033', relic_090: 'relic_090',
  relic_002: 'relic_014', relic_042: 'relic_015', relic_078: 'relic_078',
  relic_017: 'relic_007', relic_037: 'relic_040', relic_085: 'relic_085',
  relic_006: 'relic_028', relic_046: 'relic_059', relic_081: 'relic_076',
  relic_007: 'relic_002', relic_051: 'relic_061', relic_087: 'relic_088',
  relic_028: 'relic_017', relic_065: 'relic_063', relic_077: 'relic_072',
  relic_001: 'relic_005', relic_045: 'relic_010', relic_082: 'relic_092',
  relic_003: 'relic_046', relic_079: 'relic_096',
  relic_024: 'relic_032', relic_096: 'relic_037',
  relic_004: 'relic_004', relic_076: 'relic_052',
  relic_008: 'relic_019', relic_080: 'relic_047',
  relic_012: 'relic_030', relic_084: 'relic_049',
  relic_040: 'relic_011', relic_088: 'relic_057',
  relic_020: 'relic_023', relic_092: 'relic_060',
};
