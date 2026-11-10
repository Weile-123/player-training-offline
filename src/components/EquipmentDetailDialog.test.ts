import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {EquipmentDetailDialog} from './EquipmentDetailDialog';

it('shows every distinct equipment and consumable source without claiming collection ownership',()=>{
 const html=renderToStaticMarkup(createElement(EquipmentDetailDialog,{ids:['relic_036','item_001','relic_036'],onClose:()=>{}}));
 expect(html).toContain('适应性康复绷带');expect(html).toContain('应急护具');expect(html).toContain('一次性物品');
 expect(html.match(/class="equipment-detail-source"/g)).toHaveLength(2);
 expect(html).toContain('返回器械状态');expect(html).not.toContain('已收集');
});
it('retains the album return action and clearly explains missing legacy sources',()=>{
 const album=renderToStaticMarkup(createElement(EquipmentDetailDialog,{ids:['relic_036'],collected:true,backLabel:'返回器械图鉴',onClose:()=>{}}));
 expect(album).toContain('已收集');expect(album).toContain('返回器械图鉴');
 const legacy=renderToStaticMarkup(createElement(EquipmentDetailDialog,{ids:[],onClose:()=>{}}));
 expect(legacy).toContain('旧存档未记录');expect(legacy).not.toContain('已停用');
});
