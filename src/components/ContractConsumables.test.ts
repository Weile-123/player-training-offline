import {it,expect} from 'vitest';
import {newContract,dispatch} from '../game/contract/engine';
import {itemUseBlock,itemAction} from './ContractConsumables';
it('物品确认预览不扣库存、不修改手感，提交才消耗一次',()=>{
 const g=newContract(7);g.commerce.inventory.item_005=2;const before=JSON.stringify(g);
 expect(itemUseBlock(g,'item_005','p1')).toBe('');expect(JSON.stringify(g)).toBe(before);
 const r=dispatch(g,g.revision,itemAction('item_005','p1'));expect(r.error).toBeUndefined();expect(r.state.commerce.inventory.item_005).toBe(1);expect(r.state.players[0].heat).toBe(3);
});
it('物品详情按引擎校验库存、球员、火热、已预备与回溯条件',()=>{
 const g=newContract(7);expect(itemUseBlock(g,'item_005','p1')).toContain('库存');g.commerce.inventory.item_005=1;
 expect(itemUseBlock(g,'item_005',null)).toContain('选择');g.players[0].heat=10;expect(itemUseBlock(g,'item_005','p1')).toContain('火热');
 g.players[0].heat=0;g.commerce.inventory.item_001=2;g.players[0].armed=['item_001'];expect(itemUseBlock(g,'item_001','p1')).toContain('预备');
 g.commerce.inventory.item_002=1;expect(itemUseBlock(g,'item_002',null)).toContain('回溯');
});
