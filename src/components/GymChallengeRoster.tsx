import {useEffect,useRef,useState} from 'react';
import {ActionNotice} from './ActionNotice';
import {statLabels} from '../game/config';
import {statKeys,type StatKey} from '../game/types';
import {challengeBenchCap, challengePower, challengeStage, challengeUsesScheduledRewards, gearBonus, type ChallengeAction, type ChallengeGear, type ChallengePlayer, type ChallengeRun} from '../game/gym/challenge';
import {challengeCards, challengeEquipment} from '../game/gym/challengeCatalog';
import {ChallengeAbility,ChallengePortrait} from './GymChallengeBattle';
import {ComicDialog} from './ComicDialog';
import {ProductImage} from './ProductImage';
import {TierBadge} from './TierBadge';
import './GymChallengeWarehouse.css';

export type ChallengeRosterView = {kind:'profile'|'equipment'; playerId:string} | {kind:'bench'} | {kind:'warehouse'};
type OpponentSelection = {lane:number;stat:StatKey;choose:(id:string)=>void};

export function ChallengeStarters({run,disabled,open,selection,showRules}:{
  run:ChallengeRun;disabled:boolean;open:(view:ChallengeRosterView)=>void;selection?:OpponentSelection;showRules:()=>void;
}) {
  const firstChoice=useRef<HTMLButtonElement>(null);
  const lane=selection?.lane;
  const hasWarehouse=challengeUsesScheduledRewards(run.rulesVersion);
  useEffect(()=>{
    if (lane!==undefined) firstChoice.current?.focus({preventScroll:true});
  },[lane]);
  return <section className="gc-team-zone" aria-label="我方首发" data-picking={Boolean(selection)}>
    <div className="gc-team-head">
      <div className="gc-team-title">
        <h2>首发阵容</h2>
        <button type="button" className="gc-team-help" aria-label="玩法说明" aria-haspopup="dialog" disabled={disabled} onClick={showRules}>?</button>
      </div>
      {selection&&<span className="gc-team-pick-note" role="status">选择{statLabels[selection.stat]}对位</span>}
      {hasWarehouse&&<button type="button" className="gc-warehouse-link" disabled={disabled} onClick={()=>open({kind:'warehouse'})}>
        器材仓库
      </button>}
      {run.bench&&<button type="button" className="gc-bench-link" disabled={disabled} onClick={()=>open({kind:'bench'})}>
        备战席 <strong>{run.bench.length} / {challengeBenchCap}</strong><span aria-hidden="true">›</span>
      </button>}
    </div>
    <div id="gc-starters" className="gc-team">{run.team.map((player,index)=>{
      const template=challengeCards.get(player.id)!;
      return <article className="gc-player-card" data-tier={template.tier} key={player.id}>
        <ChallengePortrait id={player.id} className="gc-starter-photo"/>
        <div className="gc-player-copy">
          <h3>{template.name}</h3>
          <div className="gc-player-grade">
            <TierBadge tier={template.tier}/>
            <b className="gc-player-level">Lv.{player.level}</b>
          </div>
          <small className="gc-player-gear">装备 {player.gear.length}/3</small>
          {selection&&<ChallengeAbility stat={selection.stat} value={challengePower(player,selection.stat,run.boosts,run.settings,run.rulesVersion)/100}/>}
        </div>
        <div className="gc-player-actions">{selection
          ?<button type="button" className="gc-stamp" ref={index===0?firstChoice:undefined} aria-label={`选择 ${template.name}`}
            disabled={disabled} onClick={()=>selection.choose(player.id)}>选择</button>
          :<>
          <button type="button" className="gc-stamp gc-stamp-green" aria-label={`详情 ${template.name}`} disabled={disabled} onClick={()=>open({kind:'profile',playerId:player.id})}>详情</button>
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

function Equipment({run,player,busy,reduced,error,close,act,showWarehouse}:DialogProps & {player:ChallengePlayer;showWarehouse:()=>void}) {
  const [detail,setDetail]=useState<number|null>(null);
  const item=detail===null?undefined:player.gear[detail];
  const equipment=item&&challengeEquipment.get(item.id)!;
  const inRoster=challengeUsesScheduledRewards(run.rulesVersion);
  const canManage=inRoster&&run.phase==='ready';
  async function unequip(itemIndex:number,gear:ChallengeGear) {
    if (busy||!canManage) return;
    const ok=await act({type:'unequip-challenge-gear',attempt:run.attempt,stage:challengeStage(run),playerId:player.id,itemIndex,item:gear});
    if (ok) setDetail(null);
  }
  return <ComicDialog title={equipment?'装备档案':'球员装备'} className={`gc-dialog${reduced?' reduce-motion':''}`} onClose={close} dismissible={!busy}>
    <div className="gc-sheet" aria-busy={busy}>
      <ActionNotice message={error} role="alert"/>
      {equipment&&item ? <>
        <div className="gc-equipment-hero"><ProductImage id={equipment.id} name={equipment.name}/></div>
        <div className="gc-equipment-label"><h3>{equipment.name}</h3><b>{equipmentEffect(item)}</b></div>
        <p>已装备 · {challengeCards.get(player.id)!.name}</p>
        <div className="gc-equipment-actions">
          <button type="button" className="gc-stamp gc-stamp-navy" disabled={busy} onClick={()=>setDetail(null)}>返回装备</button>
          {canManage&&detail!==null&&<button type="button" className="gc-stamp gc-stamp-yellow" disabled={busy} onClick={()=>void unequip(detail,item)}>卸下到仓库</button>}
        </div>
      </>:<>
        <PlayerIdentity player={player} inRoster={inRoster}/>
        <div className="gc-section-head"><h3>已装备</h3><b>{player.gear.length} / 3</b></div>
        {player.gear.length===0&&<p className="gc-empty">暂无已装备器材。</p>}
        {player.gear.map((gear,index)=>{
          const data=challengeEquipment.get(gear.id)!;
          return <article className="gc-equipment-row" key={index}>
            <ProductImage id={gear.id} name={data.name}/>
            <div><h4>{data.name}</h4><b>{equipmentEffect(gear)}</b></div>
            <div className="gc-equipment-actions">
              <button type="button" className="gc-stamp gc-stamp-navy" aria-label={`查看${data.name}详情`} disabled={busy} onClick={()=>setDetail(index)}>详情</button>
              {canManage&&<button type="button" className="gc-stamp gc-stamp-yellow" aria-label={`卸下${data.name}`} disabled={busy} onClick={()=>void unequip(index,gear)}>卸下</button>}
            </div>
          </article>;
        })}
        {inRoster&&<button type="button" className="gc-stamp gc-stamp-navy" disabled={busy} onClick={showWarehouse}>查看器材仓库</button>}
      </>}
      {inRoster&&!canManage&&<p>进入下一关后可调整装备。</p>}
    </div>
  </ComicDialog>;
}

function Warehouse({run,busy,reduced,error,close,act}:DialogProps) {
  const [selected,setSelected]=useState<number|null>(null);
  const items=run.warehouse??[];
  const item=selected===null?undefined:items[selected];
  const canManage=run.phase==='ready';

  async function equip(playerId:string) {
    if (busy||!canManage||selected===null||!item) return;
    const ok=await act({type:'equip-challenge-gear',attempt:run.attempt,stage:challengeStage(run),playerId,itemIndex:selected,item});
    if (ok) setSelected(null);
  }

  return <ComicDialog title="器材仓库" className={`gc-dialog${reduced?' reduce-motion':''}`} onClose={close} dismissible={!busy}>
    <div className="gc-sheet" aria-busy={busy}>
      <ActionNotice message={error} role="alert"/>
      {item ? <>
        <div className="gc-section-head"><h3>{challengeEquipment.get(item.id)!.name}</h3><b>{equipmentEffect(item)}</b></div>
        <p>选择装备球员</p>
        <div className="gc-warehouse-targets" role="group" aria-label="选择装备球员">
          {run.team.map(player=>{
            const name=challengeCards.get(player.id)!.name;
            const full=player.gear.length>=3;
            return <div className="gc-warehouse-target" key={player.id}>
              <ChallengePortrait id={player.id} className="gc-warehouse-photo"/>
              <div><b>{name}</b><small>Lv.{player.level} · 装备 {player.gear.length}/3</small></div>
              <button type="button" className="gc-stamp gc-stamp-yellow" aria-label={`${name}${full?'装备已满':'装备此器材'}`}
                disabled={busy||!canManage||full} onClick={()=>void equip(player.id)}>{full?'装备已满':'装备'}</button>
            </div>;
          })}
        </div>
        <button type="button" className="gc-stamp gc-stamp-navy" disabled={busy} onClick={()=>setSelected(null)}>返回仓库</button>
      </>:<>
        <div className="gc-section-head"><h3>在库器材</h3><b>{items.length} 件</b></div>
        {items.length===0&&<p className="gc-empty">仓库暂无器材，卸下的挑战装备会放在这里。</p>}
        {items.map((gear,index)=>{
          const name=challengeEquipment.get(gear.id)!.name;
          return <article className="gc-equipment-row" key={index}>
            <ProductImage id={gear.id} name={name}/>
            <div><h4>{name}</h4><b>{equipmentEffect(gear)}</b></div>
            <button type="button" className="gc-stamp gc-stamp-yellow" aria-label={`为${name}选择球员`} disabled={busy||!canManage}
              onClick={()=>setSelected(index)}>选球员</button>
          </article>;
        })}
      </>}
      {!canManage&&<p>进入下一关后可调整装备。</p>}
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
  if (view.kind==='warehouse') return <Warehouse {...props}/>;
  const player=props.run.team.find(entry=>entry.id===view.playerId);
  if (!player) return null;
  if (view.kind==='profile') return <Profile {...props} player={player} showEquipment={()=>open({kind:'equipment',playerId:player.id})}/>;
  return <Equipment {...props} key={player.id} player={player} showWarehouse={()=>open({kind:'warehouse'})}/>;
}
