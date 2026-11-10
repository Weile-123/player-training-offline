import { expect,it } from 'vitest';
import { simulateCommerce } from './simulation';
import { validContract } from './save';
it('完整交易策略固定种子可重放且生成可保存的合同',()=>{
  const a=simulateCommerce(20261019,12), b=simulateCommerce(20261019,12);
  expect(a).toEqual(b); expect(validContract(a.state)).toBe(true);
  expect(a.counters['buy-equipment']).toBeGreaterThan(0);
  expect(a.counters.settlement).toBeGreaterThan(0);
});
