import type {Athlete,Contract} from '../game/contract/engine';
import {previewSettlement} from '../game/contract/engine';
export const helpKey='player-training.help.v2';
export const helpCopy={
 template:['球星已解锁','这名球员已经匹配球星模板，外观会保留并收入图鉴。模板本身不额外增加价值。'],
 heat:['下一投进入火热','手感已满。下一投开启火热，基础持续7次投篮；期间免重伤。停留或打开面板不会扣次数。'],
 signing:['交付和签约，用途不同','加入交付用于完成本月指标；推荐签约会让球员离营、换取赞助券，不计入交付。想留着培养的人可以继续休息。'],
 shop:['赞助券购买器材','器材商店使用赞助券。推荐签约可获得券；器材效果可在购买前查看。'],
 scout:['经费在球探商店使用','球探每3个月到访，可用经营经费招募新人、购买一次性物品。经费不能直接抵月度交付。'],
 shortfall:['本次结算会扣信用','当前交付未达标，确认结算会扣1点信用；信用归零将结束本局。可以返回调整名单。'],
} as const;
export type HelpId=keyof typeof helpCopy;
export function contextualHelp(g:Contract,p:Athlete|undefined,panel:string|null,seen:readonly string[]):HelpId|null{
 const ids:HelpId[]=[];
 if(panel==='交付确认'&&!previewSettlement(g).met)ids.push('shortfall');
 if(panel==='球员名单'||panel==='休息室')ids.push('signing');
 if(panel==='器材商店')ids.push('shop');
 if(panel==='外部球探'||panel==='球探到访')ids.push('scout');
 if(!panel){if(p&&p.heat>=10)ids.push('heat');if(p?.templateId)ids.push('template');}
 return ids.find(id=>!seen.includes(id))??null;
}
