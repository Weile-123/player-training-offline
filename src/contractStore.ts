import {cloneData} from './utils/cloneData';
import {rewardVideoPending} from './platform/rewardedVideo';
import {leaderboard} from './platform/leaderboard';
import {exportCloudArchive,restoreCloudArchive,localUpdatedAtKey,readLocalUpdatedAt} from './platform/cloudArchive';
import {create} from 'zustand';
import {dispatch,newContract,type Contract,type Action,type Result,type Event} from './game/contract/engine';
import {readContract,writeContract,contractSaveKeys} from './game/contract/save';
import {mergeProfile,readProfile,writeProfile,type Profile} from './game/contract/profile';
import {loadCareer,careerKey,careerBackupKey} from './game/careerSave';
import {loadCollection} from './game/collectionSave';
import {config} from './game/config';
import {slotIds,slotKey} from './game/slots';
import type {Collection as LegacyCollection} from './game/collection';
import {itemIds,rollShop,makeMerchant} from './game/contract/commerce';
import {equipmentName} from './game/contract/catalog';
import {readCareerStats,recordCareer,writeCareerStats,type CareerLedger} from './game/contract/careerStats';
type StoragePort=Pick<Storage,'getItem'|'setItem'> & Partial<Pick<Storage,'removeItem'>>;
export const archiveKey='player-training.debt-archive.v1';
const selectionKey='player-training.contract.selection';
const restingKey='player-training.contract.resting';
const scoutNoticeKey='player-training.contract.scout-notice';
// Remove the backup first: a failed main-file removal must not revive a playing backup.
function clearCareerSave(storage:StoragePort,profile:Profile):boolean {
 if(!writeProfile(storage,profile))return false;
 try{
  for(const key of [contractSaveKeys.backup,contractSaveKeys.main,selectionKey,restingKey,scoutNoticeKey]){
   if(storage.removeItem)storage.removeItem(key);else storage.setItem(key,'');
  }
  return true;
 }catch{return false;}
}
const errors:Record<string,string>={
 'share-no-template':'匹配球星模板后才可分享领奖。',
 'completion-pending':'请先在通关结算中开启无尽挑战。','level-cap':'训练已达99级上限，可加入交付或推荐签约。','insufficient-cash':'经营经费不足。','insufficient-credits':'赞助券不足，可推荐球员签约获取。','equipment-full':'器材已满8件，可在背包内弃置后购买。','withdraw-first':'请先从交付名单撤回。','gift-cannot-reroll':'首月赠礼不能刷新。','no-rewind':'没有可回溯的投篮，或未在投篮前持有回溯道具。','item-blocked-during-frenzy':'火热或满手感期间不能使用此物品。','item-already-armed':'该球员已预备此物品。','normal-shot-item-already-armed':'已预备普通训练物品，不能再补满手感。','item-unavailable':'物品已用完。','game-over':'本局已结束，请开启新生涯。','merchant-unavailable':'球探未到访或商品已售罄。','no-credit-to-repair':'信用无需修复，或本局已经修复过。','empty-shop-pool':'暂时没有可刷新的器材。',
};
export function eventText(e:Event):string|null {
 if(e.type==='share-reward')return '首次分享奖励已领取，按一次普通成功投篮结算';
 if(e.type==='equipment-unlock')return `永久解锁器材：${equipmentName(e.itemId!)}`;
 if(e.type==='unlock')return '发现新球星模板，已永久点亮图鉴';
 if(e.type==='settlement')return `第${e.month}月${e.met?'达标':'未达标，信用−1'} · 交付经费 +${e.value}`;
 if(e.type==='departed')return `球员重伤离营${e.value!=='0'?` · 保险经费 +${e.value}`:''}`;
 if(e.type==='rewound')return '已撤销上次投篮；已消费的道具和时间不返还';
 if(e.type==='duplicate')return '双生复制成功：新球员已进入休息室';
 if(e.type==='credit-rescue')return '信用紧急保障生效，恢复1点信用，保障装备已消耗';
 if(e.type==='shot-blocked')return '重伤被保护阻止，球员留营';
 if(e.type==='frenzy-end-level')return '火热结束，加练奖励+1级';
 return null;
}
export const debugSettingsKey='player-training.debug-settings.v1';
export type DebugSettings={fullCollection:boolean;noSevere:boolean;legendaryShop:boolean;mockPosterShare:boolean;mockLeaderboard:boolean;mockRewardedAds:boolean};
const defaultDebug=():DebugSettings=>({fullCollection:false,noSevere:false,legendaryShop:false,mockPosterShare:false,mockLeaderboard:false,mockRewardedAds:false});
function readDebug(storage:StoragePort):DebugSettings{
 if(!import.meta.env.DEV)return defaultDebug();
 try{const v=JSON.parse(storage.getItem(debugSettingsKey)??'null');return {fullCollection:v?.fullCollection===true,noSevere:v?.noSevere===true,legendaryShop:v?.legendaryShop===true,mockPosterShare:v?.mockPosterShare===true,mockLeaderboard:v?.mockLeaderboard===true,mockRewardedAds:v?.mockRewardedAds===true};}catch{return defaultDebug();}
}
export type DebugAction='collection'|'no-severe'|'legendary-shop'|'mock-poster-share'|'mock-leaderboard'|'mock-rewarded-ads'|'month-20'|'cash'|'credits'|'items';
export type ContractStore={updatedAt:number|null;equipmentNotices:Event[];dismissEquipmentNotice:()=>void;debug:DebugSettings;debugAct:(action:DebugAction)=>void;state:Contract;profile:Profile;careers:CareerLedger;legacy:ReturnType<typeof loadCareer>['save'];legacyCollection:LegacyCollection;hasSave:boolean;selectedId:string|null;restingIds:string[];scoutNoticeSeen:boolean;markScoutNoticeSeen:()=>void;actionError:string;clearNotice:()=>void;message:string;saveMessage:string;logs:string[];lastEvents:Event[];start:()=>boolean;finish:()=>void;select:(id:string|null)=>void;act:(a:Action)=>Result;flush:()=>void;exportArchive:()=>string;exportCloudArchive:()=>string;restoreCloudArchive:(raw:string)=>void;};
export function createContractStore(storage:StoragePort,seed:()=>number=()=>crypto.getRandomValues(new Uint32Array(1))[0],onFinished:(state:Contract)=>unknown=()=>{}){
 const loaded=readContract(storage),legacy=loadCareer({getItem:key=>storage.getItem(key),setItem:()=>{}}).save,legacyCollection=loadCollection(storage).collection;
 const initial=loaded.state??newContract(seed());const profile=mergeProfile(readProfile(storage),{collection:initial.collection,unlocked:initial.commerce.unlocked});
 initial.collection=profile.collection;initial.commerce.unlocked=profile.unlocked;
 // Legacy final saves are archived. Current saves must retain the result screen
 // until explicit finish(), even after revival, so a reload cannot lose ranking submission.
 const endedSave=loaded.state?.status==='over'&&!initial.adRewards;
 if(loaded.state&&!initial.careerId){initial.careerId=`imported-${initial.seed}`;if(initial.adInjury)initial.adInjury.before.careerId=initial.careerId;if(initial.undo)initial.undo.before.careerId=initial.careerId;}
 const careers=loaded.state?recordCareer(readCareerStats(storage),initial):readCareerStats(storage);
 const historySaved=!loaded.state||writeCareerStats(storage,careers);
 const endedSaveCleared=!endedSave||(historySaved&&clearCareerSave(storage,profile));
 let selection:string|null=null;try{selection=storage.getItem(selectionKey);}catch{/* session-only */}
 let restingIds:string[]=[];try{const raw=JSON.parse(storage.getItem(restingKey)??'[]');if(Array.isArray(raw))restingIds=[...new Set(raw.filter((id):id is string=>typeof id==='string'&&initial.players.some(p=>p.id===id&&!p.queued)))];}catch{/* recover roster metadata independently */}
 const selectedId=selection===''?null:initial.players.some(p=>p.id===selection&&!p.queued)?selection:initial.players.find(p=>!p.queued&&!restingIds.includes(p.id))?.id??null;
 restingIds=restingIds.filter(id=>id!==selectedId);
 let scoutNoticeSeen=initial.month>3;
 try{const saved=JSON.parse(storage.getItem(scoutNoticeKey)??'null');scoutNoticeSeen ||= saved?.seed===initial.seed&&saved?.seen===true;}catch{/* independent optional UI metadata */}
 let lastWrite=0,finishedCareer:string|null=null;
 // If the old save cannot be archived/read safely, play in memory without
 // replacing it. An explicit successful cloud restore lifts this protection.
 let sessionOnly=loaded.error==='storage-unavailable';
 const sessionMessage='本地存档暂不可用，当前可继续游玩；退出前可在设置中上传云存档';
 return create<ContractStore>((set,get)=>{
  const touchUpdatedAt=()=>{const updatedAt=Date.now();set({updatedAt});if(sessionOnly)return;try{storage.setItem(localUpdatedAtKey,String(updatedAt));}catch{/* Cloud backup can still preserve in-memory progress. */}};
  const persist=()=>{
   if(!get().hasSave)return;
   const updatedAt=Date.now();
   if(sessionOnly){set({updatedAt,careers:recordCareer(get().careers,get().state),saveMessage:sessionMessage});lastWrite=Date.now();return;}
   try{storage.setItem(localUpdatedAtKey,String(updatedAt));}catch{/* Current progress remains exportable. */}
   const g=get(),careers=recordCareer(g.careers,g.state),s=writeContract(storage,g.state),h=writeCareerStats(storage,careers),p=writeProfile(storage,g.profile);
   let rosterSaved=true;try{
    for(const [key,value] of [[selectionKey,g.selectedId??''],[restingKey,JSON.stringify(g.restingIds)],[scoutNoticeKey,JSON.stringify({seed:g.state.seed,seen:g.scoutNoticeSeen})]]){
     if(storage.getItem(key)!==value)storage.setItem(key,value);
    }
   }catch{rosterSaved=false;}
   set({updatedAt,careers,saveMessage:h&&p&&s.ok&&rosterSaved?'已自动存档':s.ok?'生涯已保存，部分附加记录暂未保存':sessionMessage});lastWrite=Date.now();
  };
  return {updatedAt:readLocalUpdatedAt(storage),equipmentNotices:[],dismissEquipmentNotice:()=>set({equipmentNotices:get().equipmentNotices.slice(1)}),debug:readDebug(storage),debugAct:action=>{
    if(!import.meta.env.DEV)return;
    if(rewardVideoPending())return;
    const current=get();
    if(action==='collection'||action==='no-severe'||action==='legendary-shop'||action==='mock-poster-share'||action==='mock-rewarded-ads'||action==='mock-leaderboard'){
     const key=action==='collection'?'fullCollection':action==='no-severe'?'noSevere':action==='legendary-shop'?'legendaryShop':action==='mock-poster-share'?'mockPosterShare':action==='mock-leaderboard'?'mockLeaderboard':'mockRewardedAds';
     const debug={...current.debug,[key]:!current.debug[key]};set({debug});
     try{storage.setItem(debugSettingsKey,JSON.stringify(debug));}catch{set({saveMessage:'测试开关保存失败，仅当前会话有效'});}return;
    }
    if(!current.hasSave||current.state.status!=='playing')return;
    const state=cloneData(current.state);
    if(action==='month-20'){
     state.month=20;state.completed=false;delete state.completion;
     state.commerce.shop={month:20,offers:rollShop(20,state.equipment,state.commerce.unlocked,state.rng.market,undefined,current.debug.legendaryShop?[20,30,50]:undefined),giftAvailable:false,paidRerolls:0,freeUsed:false};
     state.commerce.merchant=makeMerchant(20,state.equipment,state.credit,state.commerce.incenseUsed,state.rng.market);state.commerce.monthlyRescueUsed=false;
     set({scoutNoticeSeen:true,lastEvents:[],equipmentNotices:[],logs:[],message:'已跳至第20月，保留当前球员与资源'});
    }else if(action==='cash')state.cash=String(BigInt(state.cash)+9999n);
    else if(action==='credits')state.credits=Math.min(Number.MAX_SAFE_INTEGER,state.credits+10);
    else if(action==='items')for(const id of itemIds)state.commerce.inventory[id]=Math.min(100000,state.commerce.inventory[id]+3);
    else return;
    state.revision++;state.undo=null;state.adInjury=null;
    set({state,actionError:''});persist();
   },state:initial,profile,careers,legacy,legacyCollection,hasSave:!!loaded.state&&!endedSave,selectedId,restingIds,scoutNoticeSeen,markScoutNoticeSeen:()=>{set({scoutNoticeSeen:true});persist();},actionError:'',clearNotice:()=>set({actionError:''}),
   message:'',saveMessage:!endedSaveCleared?'上局存档暂未清理，可继续开启新生涯':loaded.error==='invalid-save'?'存档校验失败，原数据仍保留，可开启新生涯':loaded.error?sessionMessage:!endedSave&&loaded.source==='backup'?'已恢复新版备份':'',logs:[],lastEvents:[],
   finish:()=>{
    if(rewardVideoPending())return;
    if(get().state.status!=='over')return;
    const ended=get().state;
    if(ended.careerId&&finishedCareer===ended.careerId)return;
    finishedCareer=ended.careerId??null;
    const careers=recordCareer(get().careers,ended),historySaved=!sessionOnly&&writeCareerStats(storage,careers);
    const profile=mergeProfile(get().profile,{collection:get().state.collection,unlocked:get().state.commerce.unlocked});
    // Disable autosaving before the game component unmounts and flushes its clock.
    set({hasSave:false,profile,careers,selectedId:null,restingIds:[],scoutNoticeSeen:false,actionError:'',message:'',logs:[],lastEvents:[],equipmentNotices:[]});
    touchUpdatedAt();
    set({saveMessage:historySaved&&clearCareerSave(storage,profile)?'本局已结束，生涯存档已清空':'本局已结束，本地记录暂未更新，可开启新生涯'});
    try{void Promise.resolve(onFinished(ended)).catch(()=>{});}catch{/* Rankings cannot interrupt local finalization. */}
   },
   start:()=>{
    if(rewardVideoPending())return false;
    // 归档失败时保留原生涯，不静默覆盖；旧物理key始终不删改。
    try{
     const keys=[careerKey,careerBackupKey,config.saveKey,config.backupKey,config.collectionKey,config.collectionBackupKey,...slotIds.flatMap(id=>[slotKey(id),slotKey(id,true)])];
     if(legacy&&!storage.getItem(archiveKey))storage.setItem(archiveKey,JSON.stringify({version:1,sources:Object.fromEntries(keys.map(k=>[k,storage.getItem(k)])),career:legacy}));
     if(!get().hasSave&&loaded.error==='invalid-save')storage.setItem('player-training.contract.invalid',JSON.stringify(Object.fromEntries(Object.values(contractSaveKeys).map(k=>[k,storage.getItem(k)]))));
     if(get().hasSave){storage.setItem('player-training.contract.previous',JSON.stringify(get().state));}
    }catch{sessionOnly=true;}
    const careers=get().hasSave?recordCareer(get().careers,get().state,get().state.status==='over'?'over':'abandoned'):get().careers;
    // Statistics are auxiliary: their persistence must never prevent a new game.
    const p=mergeProfile(get().profile,{collection:get().state.collection,unlocked:get().state.commerce.unlocked});const state=newContract(seed(),[],p.collection);state.commerce.unlocked=[...p.unlocked];state.careerId=crypto.getRandomValues(new Uint32Array(4)).join('-');
    set({state,profile:p,careers,selectedId:state.players[0].id,restingIds:[],scoutNoticeSeen:false,actionError:'',hasSave:true,message:'每月交付球员价值达标；交付与推荐签约是两条独立渠道。',logs:[],lastEvents:[],equipmentNotices:[]});persist();return true;
   },
   select:id=>{if(rewardVideoPending())return;const g=get();if(id&&!g.state.players.some(p=>p.id===id&&!p.queued))return;
    const resting=new Set(g.restingIds);if(g.selectedId&&g.selectedId!==id&&g.state.players.some(p=>p.id===g.selectedId&&!p.queued))resting.add(g.selectedId);if(id)resting.delete(id);
    set({selectedId:id,restingIds:[...resting],actionError:''});persist();},
   act:a=>{
    const before=get().state;
    if(rewardVideoPending()&&a.type!=='ad-reward')return {state:before,events:[],error:'ad-busy'};
    const pending=before.completion&&!before.completion.acknowledged;
    const r:Result=pending&&a.type!=='continue-endless'&&a.type!=='advance'?{state:before,events:[],error:'completion-pending'}:dispatch(before,before.revision,a,import.meta.env.DEV?{noSevere:get().debug.noSevere,shopRarityWeights:get().debug.legendaryShop?[20,30,50]:undefined}:{});
    if(r.error){const message=errors[r.error]??`操作未完成：${r.error}`;set({message,actionError:message});return r;}
    r.state.careerId=before.careerId;
    const profile=mergeProfile(get().profile,{collection:r.state.collection,unlocked:r.state.commerce.unlocked});
    const notes=r.events.map(eventText).filter((t):t is string=>!!t);
    const previousSelected=get().selectedId,rewoundId=r.events.find(e=>e.type==='rewound'||e.type==='revived')?.playerId;
    const selectedId=rewoundId&&r.state.players.some(p=>p.id===rewoundId&&!p.queued)?rewoundId:r.state.players.some(p=>p.id===previousSelected&&!p.queued)?previousSelected:null;
    const resting=new Set(get().restingIds);
    for(const event of r.events)if(event.type==='duplicate'&&event.playerId)resting.add(event.playerId);
    // 引擎快照不包含界面的上场/休息名单。回溯后将当次球员恢复上场，
    // 期间换上的其他球员转入休息室，避免同时上场或把恢复球员藏在休息室中。
    if(rewoundId&&previousSelected&&previousSelected!==selectedId)resting.add(previousSelected);
    const equipmentNotices=[...get().equipmentNotices.filter(e=>e.type!=='duplicate'||r.state.players.some(p=>p.id===e.playerId)),...r.events.filter(e=>e.type==='duplicate'||e.type==='credit-rescue')];
    set({state:r.state,profile,selectedId,equipmentNotices,restingIds:[...resting].filter(id=>id!==selectedId&&r.state.players.some(p=>p.id===id&&!p.queued)),
     ...(a.type==='advance'?{}:{actionError:''}),
     ...(a.type==='advance'&&!r.events.length?{}:{lastEvents:r.events,message:notes.join(' · '),logs:[...notes,...get().logs].slice(0,60)}),hasSave:true});
    if(a.type!=='advance'||r.events.length||Date.now()-lastWrite>1000)persist();return r;
   },flush:persist,
   exportCloudArchive:()=>exportCloudArchive(get()),
   restoreCloudArchive:raw=>{
    if(rewardVideoPending())throw Error('广告进行中，请稍后同步');
    const restored=restoreCloudArchive(storage,raw),state=restored.state??newContract(seed(),[],restored.profile.collection);
    sessionOnly=false;
    const profile=mergeProfile(restored.profile,{collection:state.collection,unlocked:state.commerce.unlocked});
    state.collection=profile.collection;state.commerce.unlocked=profile.unlocked;
    set({state,profile,careers:restored.careers,hasSave:!!restored.state&&(state.status==='playing'||!!state.adRewards),...restored.roster,
     updatedAt:restored.archive.updatedAt??Date.parse(restored.archive.savedAt),equipmentNotices:[],lastEvents:[],logs:[],message:'',actionError:'',saveMessage:'已恢复云存档'});
   },
   exportArchive:()=>{
    let rawSaves:Record<string,string|null>={};try{rawSaves=Object.fromEntries(Object.values(contractSaveKeys).map(k=>[k,storage.getItem(k)]));}catch{/* in-memory snapshot is still exportable */}
    return JSON.stringify({version:1,contract:get().state,roster:{selectedId:get().selectedId,restingIds:get().restingIds,scoutNoticeSeen:get().scoutNoticeSeen},profile:get().profile,careers:get().careers,legacy,legacyCollection,rawSaves},null,2);
   },
  };
 });
}
const unavailable:StoragePort={getItem:()=>{throw Error('storage');},setItem:()=>{throw Error('storage');}};
function browserStorage(){try{return typeof window!=='undefined'?window.localStorage:unavailable;}catch{return unavailable;}}
export const useContract=createContractStore(browserStorage(),()=>typeof crypto!=='undefined'?crypto.getRandomValues(new Uint32Array(1))[0]:1,state=>leaderboard.finish(state));
