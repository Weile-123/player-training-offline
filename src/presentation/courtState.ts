import type {Athlete} from '../game/contract/engine';

export function courtNextAction(players:Athlete[],restingIds:readonly string[],met=false){
 if(met&&players.some(p=>!p.queued))return {title:'当前交付价值已达标',description:'可以选择下一位球员继续培养，或直接结束本月。',label:'查看球员',panel:'球员名单' as const,canSettle:true};
 if(players.some(p=>!p.queued&&!restingIds.includes(p.id)))return {title:'选择下一位球员',description:'空闲球员可以继续上场训练。',label:'查看球员',panel:'球员名单' as const};
 if(players.some(p=>!p.queued&&restingIds.includes(p.id)))return {title:'球员正在休息',description:'前往休息室，选择球员继续训练。',label:'查看休息室',panel:'休息室' as const};
 if(players.some(p=>p.queued))return {title:'球员已加入待交付名单',description:'可以结束本月，或在名单中撤回交付继续培养。',label:'结束本月',panel:'交付确认' as const};
 return {title:'训练营暂无球员',description:'结束本月，迎接下一批新人。',label:'结束本月',panel:'交付确认' as const};
}
