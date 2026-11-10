import {describe,it,expect} from 'vitest';
import {money} from './money';

describe('价值金额的万进制单位格式',()=>{
 it.each([['0','$0.00'],['9999','$9,999.00'],['10000','$1.00万'],['128640','$12.86万'],['1234500','$123.45万'],['99999999','$1.00亿'],['100000000','$1.00亿'],['999999999999','$1.00兆'],['1000000000000','$1.00兆'],['1234567890000','$1.23兆'],['9999999999999999','$1.00京'],['10000000000000000','$1.00京'],['12345678900000000','$1.23京']])('%s → %s',(input,expected)=>expect(money(input)).toBe(expected));
 it('使用整数运算四舍五入，不丢失超出 Number 精度的金额',()=>{
  expect(money('9007199254740993')).toBe('$9,007.20兆');
  expect(money('10049')).toBe('$1.00万');expect(money('10050')).toBe('$1.01万');
  expect(money(-2430n)).toBe('−$2,430.00');
 });
 it.each([20n,24n,28n,1000n])('10^%s 使用科学计数法，保持两位小数及精确进位',power=>{
  const unit=10n**power;
  expect(money(unit)).toBe(`$1.00e+${power}`);
  expect(money(unit-1n)).toBe(`$1.00e+${power}`);
  expect(money(unit*12345n/10000n)).toBe(`$1.23e+${power}`);
  expect(money(unit*12350n/10000n)).toBe(`$1.24e+${power}`);
  expect(money(-unit)).toBe(`−$1.00e+${power}`);
 });
 it('京与科学计数法边界和尾数进位保持一致',()=>{
  expect(money(10n**20n-10n**14n)).toBe('$9,999.99京');
  expect(money(10n**20n-5n*10n**13n)).toBe('$1.00e+20');
  expect(money(103n*10n**18n)).toBe('$1.03e+20');
  expect(money(9995n*10n**17n-1n)).toBe('$9.99e+20');
  expect(money(9995n*10n**17n)).toBe('$1.00e+21');
 });
});
