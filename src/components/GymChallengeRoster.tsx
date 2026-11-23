import {useEffect,useRef,useState} from 'react';
import {statLabels} from '../game/config';
import {statKeys,type StatKey} from '../game/types';
import {challengeBenchCap, challengePower, challengeStage, challengeUsesScheduledRewards, gearBonus, type ChallengeAction, type ChallengeGear, type ChallengePlayer, type ChallengeRun} from '../game/gym/challenge';
import {challengeCards, challengeEquipment} from '../game/gym/challengeCatalog';
import {ChallengeAbility,ChallengePortrait} from './GymChallengeBattle';
import {ComicDialog} from './ComicDialog';
import {ProductImage} from './ProductImage';
import {TierBadge} from './TierBadge';

export type ChallengeRosterView = {kind:'profile'|'equipment'; playerId:string} | {kind:'bench'};
type OpponentSelection = {lane:number;stat:StatKey;choose:(id:string)=>void};

export function ChallengeStarters({run,disabled,open,selection}:{
  run:ChallengeRun;disabled:boolean;open:(view:ChallengeRosterView)=>void;selection?:OpponentSelection;
}) {
  const firstChoice=useRef<HTMLButtonElement>(null);
  const list=useRef<HTMLDivElement>(null);
  const lane=selection?.lane;
  const fullRoster=challengeUsesScheduledRewards(run.rulesVersion);
  useEffect(()=>{
    if (lane===undefined) return;
    if (list.current) list.current.scrollLeft=0;
    firstChoice.current?.focus({preventScroll:true});
  },[lane]);
  return <section className="gc-team-zone" aria-label="我方首发" data-picking={Boolean(selection)}>
    <div className="gc-team-head">
      <h2>首发阵容</h2>
      {selection&&<span className="gc-team-pick-note" role="status">选择{statLabels[selection.stat]}对位</span>}
      {fullRoster&&<small className="gc-roster-hint">向右滑动可查看完整阵容</small>}
      {run.bench&&<button type="button" className="gc-bench-link" disabled={disabled} onClick={()=>open({kind:'bench'})}>
        备战席 <strong>{run.bench.length} / {challengeBenchCap}</strong><span aria-hidden="true">›</span>
      </button>}
    </div>
    <div id="gc-starters" ref={list} className={`gc-team${fullRoster?' gc-team-scroll':''}`} aria-label={fullRoster?'完整阵容':undefined} tabIndex={fullRoster&&run.team.length>3?0:undefined}>{run.team.map((player,index)=>{
      const template=challengeCards.get(player.id)!;
      return <article className="gc-player-card" data-tier={template.tier} key={player.id}>
        <div className="gc-player-art"><ChallengePortrait id={player.id} className="gc-starter-photo"/><b>Lv.{player.level}</b></div>
        <h3>{template.name}</h3>
        <div className="gc-player-meta"><TierBadge tier={template.tier}/>{selection
          ?<ChallengeAbility stat={selection.stat} value={challengePower(player,selection.stat,run.boosts,run.settings,run.rulesVersion)/100}/>
          :<small>装备 {player.gear.length}/3</small>}</div>
        <div className="gc-player-actions" data-picking={Boolean(selection)}>{selection
          ?<button type="button" className="gc-stamp" ref={index===0?firstChoice:undefined} aria-label={`选择 ${template.name}`}
            disabled={disabled} onClick={()=>selection.choose(player.id)}>选择</button>
          :<>
          <button type="button" className="gc-stamp gc-stamp-green" aria-label={`查看球员 ${template.name}`} disabled={disabled} onClick={()=>open({kind:'profile',playerId:player.id})}><span className="gc-view-verb">查看</span>球员</button>
          <button type="button" className="gc-stamp gc-stamp-yellow" aria-label={`查看装备 ${template.name}`} disabled={disabled} onClick={()=>open({kind:'equipment',playerId:player.id})}>装备</button>
          </>}</div>
      </article>;
    })}</div>
  </section>;
}

type DialogProps = {run:ChallengeRun; busy:boolean; reduced:boolean; error:string; close:()=>void; act:(action:ChallengeAction)=>Promise<boolean>};

function PlayerIdentity({player,reserve=false,inRoster=false}:{player:ChallengePlayer;reserve?:boolean;inRoster?:boolean}) {
  const template=challengeCards.get(player.id)!;
  return <div className="gc-profile-identity">
    <ChallengePortrait id={player.id} className="gc-profile-photo"/>
    <div><h3>{template.name}</h3><p><TierBadge tier={template.tier}/> <strong>Lv.{player.level}</strong>{!inRoster&&<> · {reserve?'备战席':'首发'}</>}</p></div>
  </div>;
}

function Profile({run,player,reduced,close,showEquipment}:Pick<DialogProps,'run'|'reduced'|'close'> & {player:ChallengePlayer;showEquipment:()=>void}) {
  return <ComicDialog title="球员面板" className={`gc-dialog${reduced?' reduce-motion':''}`} onClose={close}>
    <div className="gc-sheet">
      <PlayerIdentity player={player} inRoster={challengeUsesScheduledRewards(run.rulesVersion)}/>
      <dl className="gc-profile-stats">{statKeys.map(key=><div key={key}><dt>{statLabels[key]}</dt><dd>{Number((challengePower(player,key,run.boosts,run.settings,run.rulesVersion)/100).toFixed(2))}</dd></div>)}</dl>
      <button type="button" className="gc-stamp gc-stamp-yellow" onClick={showEquipment}>查看装备 · {player.gear.length} / 3</button>
    </div>
  </ComicDialog>;
}

function equipmentEffect(item:ChallengeGear) {
  const {key}=challengeEquipment.get(item.id)!;
  return `${key==='all'?'六维':statLabels[key]} +${gearBonus(item)}`;
}

function Equipment({player,reduced,close,inRoster}:{player:ChallengePlayer;reduced:boolean;close:()=>void;inRoster:boolean}) {
  const [detail,setDetail]=useState<number|null>(null);
  const item=detail===null?undefined:player.gear[detail];
  const equipment=item&&challengeEquipment.get(item.id)!;
  return <ComicDialog title={equipment?'装备档案':'球员装备'} className={`gc-dialog${reduced?' reduce-motion':''}`} onClose={close}>
    <div className="gc-sheet">
      {equipment&&item ? <>
        <div className="gc-equipment-hero"><ProductImage id={equipment.id} name={equipment.name}/></div>
        <div className="gc-equipment-label"><h3>{equipment.name}</h3><b>{equipmentEffect(item)}</b></div>
        <p>已绑定 · {challengeCards.get(player.id)!.name}</p>
        <button type="button" className="gc-stamp gc-stamp-navy" onClick={()=>setDetail(null)}>返回装备</button>
      </>:<>
        <PlayerIdentity player={player} inRoster={inRoster}/>
        <div className="gc-section-head"><h3>已装备</h3><b>{player.gear.length} / 3</b></div>
        {player.gear.length===0&&<p className="gc-empty">装备奖励可绑定给{inRoster?'阵容内':'首发'}球员。</p>}
        {player.gear.map((gear,index)=>{
          const data=challengeEquipment.get(gear.id)!;
          return <article className="gc-equipment-row" key={index}>
            <ProductImage id={gear.id} name={data.name}/>
            <div><h4>{data.name}</h4><b>{equipmentEffect(gear)}</b></div>
            <button type="button" className="gc-stamp gc-stamp-navy" aria-label={`查看${data.name}详情`} onClick={()=>setDetail(index)}>详情</button>
          </article>;
        })}
      </>}
    </div>
  </ComicDialog>;
}

function Bench({run,busy,reduced,error,close,act}:DialogProps) {
  const [reserveId,setReserve]=useState<string|null>(null);
  const [starterId,setStarter]=useState<string|null>(null);
  const reserves=run.bench??[];
  const canSwap=run.phase==='ready';
  async function swap() {
    if (!canSwap||!starterId||!reserveId) return;
    const ok=await act({type:'swap-challenge-lineup',attempt:run.attempt,stage:challengeStage(run),starterId,reserveId});
    if (ok) close();
  }
  return <ComicDialog title="备战席" className={`gc-dialog${reduced?' reduce-motion':''}`} onClose={close} dismissible={!busy}>
    <div className="gc-sheet" aria-busy={busy}>
      <div className="gc-section-head"><h3>备战球员</h3><b>{reserves.length} / {challengeBenchCap}</b></div>
      {error&&<p role="alert">{error}</p>}
      {reserves.length===0?<p className="gc-empty">暂无备战球员。过关后可把新球员放入备战席。</p>:<>
        <p>{canSwap?'赛前可互换首发和备战球员，等级和装备随球员保留。':'进入下一关后可调整首发。'}</p>
        {reserves.map(player=>
          <div className="gc-bench-row" key={player.id} data-selected={reserveId===player.id}>
            <PlayerIdentity player={player} reserve/>
            {canSwap&&<button type="button" className="gc-stamp gc-stamp-navy" aria-label={`${challengeCards.get(player.id)!.name}调入首发`}
              disabled={busy} aria-pressed={reserveId===player.id}
              onClick={()=>{setReserve(player.id);setStarter(null);}}>{reserveId===player.id?'已选中':'调入首发'}</button>}
          </div>
        )}
      </>}
      {canSwap&&reserves.some(player=>player.id===reserveId)&&<>
        <div className="gc-section-head"><h3>选择换下的首发</h3></div>
        <div className="gc-bench-targets" role="group" aria-label="选择换下的首发">{run.team.map(player=>{
          const name=challengeCards.get(player.id)!.name;
          return <button type="button" key={player.id} aria-label={`换下${name}`} aria-pressed={starterId===player.id}
            disabled={busy} onClick={()=>setStarter(player.id)}>
            <ChallengePortrait id={player.id} className="gc-reserve-photo"/><b>{name}</b><small>Lv.{player.level} · 装备 {player.gear.length}/3</small>
          </button>;
        })}</div>
        <button type="button" className="gc-stamp" disabled={busy||!starterId} onClick={()=>void swap()}>确认交换</button>
      </>}
    </div>
  </ComicDialog>;
}

export function ChallengeRosterDialog({view,open,...props}:DialogProps & {view:ChallengeRosterView;open:(view:ChallengeRosterView)=>void}) {
  if (view.kind==='bench') return <Bench {...props}/>;
  const player=props.run.team.find(entry=>entry.id===view.playerId);
  if (!player) return null;
  if (view.kind==='profile') return <Profile {...props} player={player} showEquipment={()=>open({kind:'equipment',playerId:player.id})}/>;
  return <Equipment key={player.id} player={player} reduced={props.reduced} close={props.close} inRoster={challengeUsesScheduledRewards(props.run.rulesVersion)}/>;
}
