import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {statLabels} from '../game/config';
import {statKeys, type StatKey} from '../game/types';
import {
  applyChallengeOffer, challengeBenchCap, challengeEntrant, challengeLevelGain, challengeOffers, challengePower,
  challengeReserveTarget, challengeRewardCategories, challengeRewardChoices, challengeRoster, challengeRosterCap, challengeStage,
  challengeTeamFlatGain, challengeUsesCollection, challengeUsesManualMatchups, challengeUsesScheduledRewards, gearBonus,
  type ChallengeAction, type ChallengeGear, type ChallengeOffer, type ChallengePlayer, type ChallengeRewardCategory, type ChallengeRun,
} from '../game/gym/challenge';
import {challengeCards, challengeEquipment} from '../game/gym/challengeCatalog';
import {ComicDialog} from './ComicDialog';
import {GameIcon} from './GameIcon';
import {ChallengePortrait} from './GymChallengeBattle';
import {ProductImage} from './ProductImage';
import {TierBadge} from './TierBadge';
import './GymChallengeRewards.css';

type Props = {
  run: ChallengeRun;
  seed: number;
  pool: readonly string[];
  busy: boolean;
  act: (action: ChallengeAction) => void;
  onClose: () => void;
  error?: string;
  reduced?: boolean;
};

const rewardNames: Record<ChallengeRewardCategory, string> = {
  team:'属性提升', swap:'选择新球员', gear:'获取装备', level:'提高等级',
};
type Destination = 'starter' | 'bench';
type GearOffer = Extract<ChallengeOffer,{kind:'gear'}>;
type RecruitOffer = Extract<ChallengeOffer,{kind:'swap'}>;

function RewardArt({kind}:{kind:ChallengeRewardCategory}) {
  return <span className="gcr-category-art" aria-hidden="true">
    {kind==='team'?<GameIcon name="train"/>:
      kind==='swap'?<GameIcon name="people"/>:
      kind==='gear'?<GameIcon name="bag"/>:
      <span className="gcr-level-art"><i/><i/><i/><b>↑</b></span>}
  </span>;
}

function ChooseCategory({run,busy,act}:Pick<Props,'run'|'busy'|'act'>) {
  const detail:Record<ChallengeRewardCategory,string> = {
    team:'三项随机属性 · 全队强化',
    swap:run.bench?'招募三选一 · 可加入备战席':challengeUsesCollection(run.rulesVersion)?'图鉴球员三选一':'校友三选一',
    gear:'三件随机器械 · 指定一人装备',
    level:`指定一人 · 六维各 +${challengeLevelGain(run.settings)}`,
  };
  const stage=challengeStage(run);
  return <>
    <p className="gcr-note">本关可选一种奖励，选择后揭晓内容。</p>
    <div className="gcr-categories" role="group" aria-label="本关奖励类型">
      {challengeRewardCategories.map(category=>
        <button type="button" className="gcr-category" data-reward={category} key={category} disabled={busy}
          onClick={()=>act({type:'choose-challenge-reward',attempt:run.attempt,stage,category})}>
          <RewardArt kind={category}/>
          <span className="gcr-category-caption"><strong>{rewardNames[category]}</strong><small>{detail[category]}</small></span>
          <b className="gcr-category-next" aria-hidden="true">›</b>
        </button>
      )}
    </div>
  </>;
}

function gearDescription(item:ChallengeGear) {
  const gear=challengeEquipment.get(item.id)!;
  return {name:gear.name,effect:`${gear.key==='all'?'六维':statLabels[gear.key]} +${gearBonus(item)}`};
}

function GearArt({item}:{item:ChallengeGear}) {
  return <span className="gcr-gear-art"><ProductImage id={item.id} name={challengeEquipment.get(item.id)!.name}/></span>;
}

function OfferCard({offer,run}:{offer:ChallengeOffer;run?:ChallengeRun}) {
  switch(offer.kind) {
    case 'swap': {
      const player=challengeCards.get(offer.id)!;
      const entrant=challengeEntrant(offer.id,run?.settings);
      return <>
        <ChallengePortrait id={offer.id} className="gcr-portrait"/>
        <span className="gcr-option-copy">
          <span className="gcr-player-heading"><strong>{player.name}</strong><TierBadge tier={player.tier}/>
            {run?.settings&&<small className="gcr-gain">Lv.{entrant.level}</small>}</span>
          <span className="gcr-skill-list">{statKeys.map(key=>{
            const value=run?.settings?challengePower(entrant,key,run.boosts,run.settings,run.rulesVersion)/100:player.stats[key];
            return <small key={key}>{statLabels[key]} <b>{Number(value.toFixed(2))}</b></small>;
          })}</span>
        </span>
      </>;
    }
    case 'gear': {
      const {name,effect}=gearDescription(offer.item);
      return <><GearArt item={offer.item}/><span className="gcr-option-copy"><strong>{name}</strong><small className="gcr-gain">{effect}</small></span></>;
    }
    case 'team':
      return <><span className="gcr-legacy-icon" data-reward="team"><RewardArt kind="team"/></span><span className="gcr-option-copy"><strong>全队{statLabels[offer.key]}提升</strong><small>每人 +{challengeTeamFlatGain(run?.settings)}，再加各自基础值的 2%</small></span></>;
    case 'level':
      return <><span className="gcr-legacy-icon" data-reward="level"><RewardArt kind="level"/></span><span className="gcr-option-copy"><strong>提高等级</strong><small>指定一人升 1 级，六维各 +{challengeLevelGain(run?.settings)}</small></span></>;
  }
}

function TeamGain({run,attribute}:{run:ChallengeRun;attribute:StatKey}) {
  const label=statLabels[attribute];
  const flat=challengeTeamFlatGain(run.settings);
  return <div className="gcr-effect">
    <div className="gcr-effect-heading"><strong>全队{label}</strong><small>每人 +{flat}，再加各自基础值的 2%</small></div>
    {challengeRoster(run).map(({id})=>{
      const player=challengeCards.get(id)!;
      const amount=Number((flat+player.stats[attribute]*.02).toFixed(2));
      return <div className="gcr-effect-row" key={id}><ChallengePortrait id={id} className="gcr-portrait"/><span>{player.name}</span><b>+{amount}</b></div>;
    })}
  </div>;
}

function PlayerTarget({team,selected,pick,busy,mode,replaceLabel}:{team:readonly ChallengePlayer[];selected:number|readonly number[];pick:(index:number)=>void;busy:boolean;mode:'level'|'gear'|'swap';replaceLabel?:string}) {
  const label=mode==='level'?'选择升级球员':mode==='gear'?'选择装备球员':replaceLabel??'选择换下的首发';
  return <fieldset className={`gcr-targets${mode==='level'?' gcr-level-targets':''}`}>
    <legend>{label}</legend>
    {team.map((player,index)=>
      <button type="button" key={player.id} className="gcr-target" aria-pressed={typeof selected==='number'?selected===index:selected.includes(index)} disabled={busy} onClick={()=>pick(index)}>
        <ChallengePortrait id={player.id} className="gcr-portrait"/>
        <span><strong>{challengeCards.get(player.id)!.name}</strong><small>{mode==='gear'?`装备 ${player.gear.length}/3`:
          mode==='level'?<>Lv.{player.level} <b className="gcr-gain">→ Lv.{player.level+1}</b></>:`Lv.${player.level} · 装备 ${player.gear.length}/3`}</small></span>
      </button>
    )}
  </fieldset>;
}

function GearPlacement({card,team,target,pickTarget,slot,pickSlot,busy}:{
  card:GearOffer;team:readonly ChallengePlayer[];target:number;pickTarget:(index:number)=>void;slot:number;pickSlot:(index:number)=>void;busy:boolean;
}) {
  const selected=team[target];
  return <>
    <div className="gcr-arrange-card"><OfferCard offer={card}/></div>
    <PlayerTarget team={team} selected={target} pick={pickTarget} busy={busy} mode="gear"/>
    {selected?.gear.length===3&&<fieldset className="gcr-candidates gcr-existing-gear">
      <legend>装备已满 · 选择要替下的一件</legend>
      {selected.gear.map((item,index)=>{
        const {name,effect}=gearDescription(item);
        return <button type="button" className="gcr-option" key={index} aria-pressed={slot===index} disabled={busy} onClick={()=>pickSlot(index)}>
          <GearArt item={item}/><span className="gcr-option-copy"><strong>{name}</strong><small>{effect}</small></span>
          <b className="gcr-check" aria-hidden="true">{slot===index?'✓':'›'}</b>
        </button>;
      })}
    </fieldset>}
  </>;
}

function RecruitPlacement({card,run,destination,pickDestination,target,pickTarget,busy}:{
  card:RecruitOffer;run:ChallengeRun;destination:Destination;pickDestination:(destination:Destination)=>void;target:number;pickTarget:(index:number)=>void;busy:boolean;
}) {
  const bench=run.bench;
  const entrant=challengeEntrant(card.id,run.settings);
  const replacing=destination==='starter'&&target>=0?applyChallengeOffer(run,card,target,-1)?.team[target]:undefined;
  return <>
    <div className="gcr-arrange-card"><OfferCard offer={card} run={run}/></div>
    {bench&&<div className="gcr-destinations" role="group" aria-label="安排新球员">
      <button type="button" aria-pressed={destination==='bench'} disabled={busy||bench.length>=challengeBenchCap} onClick={()=>pickDestination('bench')}>
        <strong>加入备战席</strong><small>{bench.length>=challengeBenchCap?`${challengeBenchCap}/${challengeBenchCap} 已满`:`${bench.length}/${challengeBenchCap} · 从 Lv.${entrant.level} 开始`}</small>
      </button>
      <button type="button" aria-pressed={destination==='starter'} disabled={busy} onClick={()=>pickDestination('starter')}>
        <strong>直接换上首发</strong><small>{run.settings?'继承本局升级次数和装备':'接手被换下球员的等级和装备'}</small>
      </button>
    </div>}
    {destination==='bench'?<p className="gcr-note">加入后可在下一关开始前调入首发。</p>:
      <><PlayerTarget team={run.team} selected={target} pick={pickTarget} busy={busy} mode="swap"/>
        {replacing&&run.settings&&<p className="gcr-note">新首发 Lv.{replacing.level} · 装备 {replacing.gear.length}/3</p>}</>}
  </>;
}

function RewardSheet({title,busy,onClose,error,reduced,children,footer}:Pick<Props,'busy'|'onClose'|'error'|'reduced'> & {title:string;children:ReactNode;footer?:ReactNode}) {
  const body=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const scroll=body.current?.closest('.sheet-scroll');
    if(scroll) scroll.scrollTop=0;
  },[title]);
  return <ComicDialog title={title} className={`gc-dialog gc-reward-dialog${reduced?' reduce-motion':''}`} onClose={onClose}
    dismissible={!busy} footer={footer&&<div className="gcr-footer">{footer}</div>}>
    <div className="gcr-body" ref={body} aria-busy={busy}>
      {error&&<p className="gcr-error" role="alert">{error}</p>}
      {children}
    </div>
  </ComicDialog>;
}

function RewardSelection({run,seed,pool,busy,act,onClose,error,reduced}:Props) {
  const stage=challengeStage(run);
  const category=run.rewardCategory;
  const offers=category
    ? challengeRewardChoices(seed,stage,challengeRoster(run),pool,run.offerPoolSize,category,run.rulesVersion,run.settings)
    : challengeOffers(seed,stage,run.team,pool,run.offerPoolSize);
  const [picked,setOffer]=useState<number|null>(category==='level'?0:null);
  const [arranging,setArranging]=useState(category==='level');
  const [target,setTarget]=useState(-1);
  const [slot,setSlot]=useState(-1);
  const [destination,setDestination]=useState<Destination>(()=>run.bench&&run.bench.length<challengeBenchCap?'bench':'starter');
  const card=picked===null?null:offers[picked];
  const recipient=run.team[target];
  const toBench=card?.kind==='swap'&&destination==='bench';
  const rewardTarget=toBench?challengeReserveTarget:target;
  const validChoice=card&&applyChallengeOffer(run,card,rewardTarget,slot)!==null;
  const replace=card?.kind==='gear'&&recipient?.gear.length===3;

  const pickTarget=(index:number)=>{setTarget(index);setSlot(-1);};
  function takeReward() {
    if(picked===null||!validChoice) return;
    const attachment=toBench?{toBench:true as const}:{
      ...(recipient?{targetId:recipient.id}:{}),...(replace?{replaceSlot:slot}:{}),
    };
    act({type:'take-challenge-reward',attempt:run.attempt,stage,offer:picked,...attachment});
  }
  function pickOffer(index:number) {
    setOffer(index);
    setTarget(-1);
    setSlot(-1);
  }
  let title=category?rewardNames[category]:'选择本关奖励';
  let content:ReactNode;
  let footer:ReactNode;
  if (arranging&&card) {
    const back=category==='level'?null:<button type="button" className="gc-stamp gc-stamp-navy" disabled={busy} onClick={()=>setArranging(false)}>返回候选</button>;
    let confirm: string;
    if (card.kind==='gear') {
      title='分配装备';
      content=<GearPlacement card={card} team={run.team} target={target} pickTarget={pickTarget} slot={slot} pickSlot={setSlot} busy={busy}/>;
      confirm=replace?'确认替换装备':'确认装备';
    } else if (card.kind==='swap') {
      title='新球员去向';
      content=<RecruitPlacement card={card} run={run} destination={destination} pickDestination={setDestination} target={target} pickTarget={pickTarget} busy={busy}/>;
      confirm=toBench?'确认加入备战席':'确认换上首发';
    } else {
      title='提高等级';
      content=<><p className="gcr-note">选一名首发球员提升 1 级，六维各 +{challengeLevelGain(run.settings)}。</p>
        <PlayerTarget team={run.team} selected={target} pick={pickTarget} busy={busy} mode="level"/></>;
      confirm='确认升级';
    }
    footer=<>{back}<button type="button" className="gc-stamp" disabled={busy||!validChoice} onClick={takeReward}>{confirm}</button></>;
  } else {
    content=<>
      {category==='swap'&&<p className="gcr-note">{challengeUsesManualMatchups(run.rulesVersion)?'全体球员进入招募池，高品质球员随关卡推进出现。':
        challengeUsesCollection(run.rulesVersion)?'从已解锁图鉴中抽出三人，可选一人加入本局。':'从已推荐校友中抽出三人，可选一人加入本局。'}</p>}
      {category==='team'?
        <div className="gcr-attributes" role="group" aria-label="随机出现的属性">
          {offers.map((offer,index)=>offer.kind==='team'&&<button type="button" key={offer.key} disabled={busy} aria-pressed={picked===index} onClick={()=>pickOffer(index)}>
            <strong>{statLabels[offer.key]}</strong><small>全队提升</small>
          </button>)}
        </div>:
        <div className="gcr-candidates" role="group" aria-label="奖励候选">
          {offers.map((offer,index)=><button type="button" className="gcr-option" key={index} disabled={busy} aria-pressed={picked===index} onClick={()=>pickOffer(index)}>
            <OfferCard offer={offer} run={run}/><b className="gcr-check" aria-hidden="true">{picked===index?'✓':'›'}</b>
          </button>)}
        </div>}
      {card?.kind==='team'&&<TeamGain run={run} attribute={card.key}/>}
    </>;
    const confirm=card?.kind==='swap'?'安排所选球员':card?.kind==='gear'?'分配所选装备':card?.kind==='level'?'选择升级球员':'确认强化';
    footer=<>
      {category==='swap'&&<button type="button" className="gc-stamp gc-stamp-navy" disabled={busy}
        onClick={()=>act({type:'take-challenge-reward',attempt:run.attempt,stage,offer:-1})}>都不要</button>}
      <button type="button" className="gc-stamp" disabled={busy||!card}
        onClick={()=>card?.kind==='team'?takeReward():setArranging(true)}>{confirm}</button>
    </>;
  }
  return <RewardSheet title={title} busy={busy} onClose={onClose} error={error} reduced={reduced} footer={footer}>{content}</RewardSheet>;
}

export function GymChallengeRewards(props:Props) {
  const {run,busy,act,onClose,error,reduced}=props;
  if (run.phase!=='reward') return null;
  if (challengeUsesScheduledRewards(run.rulesVersion)) return <ScheduledRewardSelection key={`${run.attempt}:${challengeStage(run)}:${run.rewardCategory}`} {...props}/>;
  if (run.rulesVersion&&!run.rewardCategory) {
    return <RewardSheet title="选择奖励" busy={busy} onClose={onClose} error={error} reduced={reduced}>
      <ChooseCategory run={run} busy={busy} act={act}/>
    </RewardSheet>;
  }
  return <RewardSelection key={`${run.attempt}:${challengeStage(run)}:${run.rewardCategory??''}`} {...props}/>;
}

function ScheduledRewardSelection({run,seed,pool,busy,act,onClose,error,reduced}:Props) {
  const stage=challengeStage(run),category=run.rewardCategory!;
  const aid=run.revival?.stage===stage&&!run.revival.move;
  const offers=challengeRewardChoices(seed,stage,run.team,pool,run.offerPoolSize,category,run.rulesVersion,run.settings,aid);
  const [picked,setPicked]=useState<number|null>(null);
  const [arranging,setArranging]=useState(false);
  const [target,setTarget]=useState(-1);
  const [slot,setSlot]=useState(-1);
  const [levels,setLevels]=useState<number[]>([]);
  const card=picked===null?null:offers[picked];
  const atCapacity=run.team.length>=challengeRosterCap;
  const command={type:'take-challenge-reward',attempt:run.attempt,stage} as const;
  const sheet={busy,onClose,error,reduced};
  const pickTarget=(index:number)=>{setTarget(index);setSlot(-1);};

  if (category==='level') {
    const canUpgrade=levels.length===2;
    function upgrade() {
      if (canUpgrade) act({...command,offer:0,levelTargetIds:[run.team[levels[0]].id,run.team[levels[1]].id]});
    }
    const pickLevel=(index:number)=>setLevels(previous=>previous.includes(index)?previous.filter(item=>item!==index):previous.length<2?[...previous,index]:previous);
    return <RewardSheet {...sheet} title="提高等级" footer={<button type="button" className="gc-stamp" disabled={busy||!canUpgrade} onClick={upgrade}>确认升级 · {levels.length} / 2</button>}>
      <p className="gcr-note">选择两名球员，各提升 1 级，六维各 +{challengeLevelGain(run.settings)}。</p>
      {run.gearMilestones?.[stage]&&<p className="gcr-note">本关已选装备将在确认升级后一起生效。</p>}
      <PlayerTarget team={run.team} selected={levels} pick={pickLevel} busy={busy} mode="level"/>
    </RewardSheet>;
  }

  function takeReward() {
    if (picked===null||!card) return;
    const selectedPlayer=run.team[target];
    if (card.kind==='swap'&&!atCapacity) {
      act({...command,offer:picked});
    } else if (selectedPlayer) {
      act({...command,offer:picked,targetId:selectedPlayer.id,...(card.kind==='gear'&&selectedPlayer.gear.length===3?{replaceSlot:slot}:{})});
    }
  }
  if (arranging&&card&&(card.kind==='swap'||card.kind==='gear')) {
    const isGear=card.kind==='gear';
    const replaceGear=isGear&&run.team[target]?.gear.length===3;
    const footer=<>
      <button type="button" className="gc-stamp gc-stamp-navy" disabled={busy} onClick={()=>setArranging(false)}>返回候选</button>
      <button type="button" className="gc-stamp" disabled={busy||target<0||replaceGear&&slot<0} onClick={takeReward}>{isGear?replaceGear?'确认替换装备':'确认装备':'确认换人'}</button>
    </>;
    return <RewardSheet {...sheet} title={isGear?'分配装备':'替换阵容球员'} footer={footer}>
      {card.kind==='gear'?<GearPlacement card={card} team={run.team} target={target} pickTarget={pickTarget} slot={slot} pickSlot={setSlot} busy={busy}/>:
        <>
          <div className="gcr-arrange-card"><OfferCard offer={card} run={run}/></div>
          <p className="gcr-note">阵容已满。换下的球员和他的装备将一起离队。</p>
          <PlayerTarget team={run.team} selected={target} pick={pickTarget} busy={busy} mode="swap" replaceLabel="选择换下的球员"/>
        </>}
    </RewardSheet>;
  }

  const recruiting=category==='swap';
  const confirm=recruiting?atCapacity?'选择换下的球员':'加入阵容':'分配所选装备';
  const footer=<>
    {recruiting&&<button type="button" className="gc-stamp gc-stamp-navy" disabled={busy} onClick={()=>act({...command,offer:-1})}>都不要</button>}
    <button type="button" className="gc-stamp" disabled={busy||!card} onClick={()=>recruiting&&!atCapacity?takeReward():setArranging(true)}>{confirm}</button>
  </>;
  return <RewardSheet {...sheet} title={aid?'强力援助':rewardNames[category]} footer={footer}>
    {recruiting&&<p className="gcr-note">{aid?'本次候选包含一名巨星。选一名球员加入后重试本关。':`当前阵容 ${run.team.length} / ${challengeRosterCap} 人`}</p>}
    <div className="gcr-candidates" role="group" aria-label="奖励候选">{offers.map((offer,index)=><button type="button" className="gcr-option" key={index}
      disabled={busy} aria-pressed={picked===index} onClick={()=>{setPicked(index);pickTarget(-1);}}>
      <OfferCard offer={offer} run={run}/><b className="gcr-check" aria-hidden="true">{picked===index?'✓':'›'}</b>
    </button>)}</div>
  </RewardSheet>;
}
