import {HeatBoostDialog} from './HeatBoostDialog';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {PlayerTemplatePanel} from './PlayerTemplatePanel';
import {RewardedAdButton} from './RewardedAdButton';
import {ContractHeatMeter} from './ContractHeatMeter';
import {heatMeter} from '../presentation/heatMeter';
import {newContract} from '../game/contract/engine';
import type {Player} from '../game/types';

it('an anonymous athlete shows only the actual training level; matched athlete restores sharing',()=>{
 const g=newContract(4),p=g.players[0];
 const player:Player={...p,name:'新秀',age:18,level:1,hotShots:0,iceShots:0};
 const render=(templateId:string|null)=>renderToStaticMarkup(createElement(PlayerTemplatePanel,{player:{...player,templateId},feedback:null,disabled:false,onShare:()=>{}}));
 const rookie=render(null);expect(rookie).toContain('训练1 | 等待匹配');expect(rookie).not.toContain('template-share-button');expect(rookie).not.toContain('分享+1');
 const matched=render('curry');expect(matched).toContain('template-share-button');expect(matched).toContain('训练1 | 分享+1');
 expect(matched.indexOf('template-share-button')).toBeGreaterThan(matched.indexOf('template-identity-meta'));
 expect(matched).not.toContain('template-heading');
});
it('ad buttons use a play icon and the legendary button has a gold variant',()=>{
 const html=renderToStaticMarkup(createElement(RewardedAdButton,{reward:'legendary-shop',label:'看广告·必得传说',gold:true}));
 expect(html).toContain('is-gold');expect(html).toContain('<svg');expect(html).toContain('看广告·必得传说');expect(html).not.toContain('⟳');
});
it('heat action is below the readout and absent when no action is supplied',()=>{
 const g=newContract(4),p=g.players[0],meter=heatMeter(g,p);
 const html=renderToStaticMarkup(createElement(ContractHeatMeter,{meter,heat:0,action:createElement('button',{},'加速')}));
 expect(html.indexOf('加速')).toBeGreaterThan(html.indexOf('energy-readout'));expect(html).toContain('has-ad');
 const consumed=renderToStaticMarkup(createElement(ContractHeatMeter,{meter,heat:0}));expect(consumed).not.toContain('加速');expect(consumed).not.toContain('has-ad');
});

it('heat boost dialog previews capped progress without ad wording',()=>{
 const render=(heat:number)=>renderToStaticMarkup(createElement(HeatBoostDialog,{playerId:'p1',heat,onClose:()=>{}}));
 const full=render(9);expect(full).toContain('加速火热');expect(full).toContain('立即进入火热');expect(full).toContain('火热槽从9格增加至10格');expect(full).not.toContain('广告');
 const partial=render(2);expect(partial).toContain('火热槽从2格增加至5格');expect(partial.match(/class="is-added"/g)).toHaveLength(3);
});
