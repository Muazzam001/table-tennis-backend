import { describe, expect, it } from 'vitest';
import { sqlCount, sqlInt } from '../../utils/sql.js';

describe('sqlInt', () => {
  it('coerces PostgreSQL bigint strings', () => {
    expect(sqlInt('32')).toBe(32);
    expect(sqlInt(32)).toBe(32);
  });

  it('returns fallback for empty values', () => {
    expect(sqlInt(null, 0)).toBe(0);
    expect(sqlInt('', 5)).toBe(5);
    expect(sqlInt(undefined, 7)).toBe(7);
  });
});

describe('sqlCount', () => {
  it('reads count from the first result row', () => {
    expect(sqlCount([{ count: '12' }])).toBe(12);
    expect(sqlCount([{ team_count: '4' }], 'team_count')).toBe(4);
    expect(sqlCount([], 'count', 0)).toBe(0);
  });
});
