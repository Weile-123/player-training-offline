import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {statLabels} from '../game/config';
import {statKeys, type Stats} from '../game/types';
import {challengeCanStart, challengePlayerPool, type GymState} from '../game/gym/engine';
import {
  challengeBest,challengeCheckpoint,challengeDraft,challengeEntrant,challengeFamePerStage,challengeFixture,challengeMatchesAssigned,
  challengeNextMilestone,challengePower,challengeScheduledRewards,challengeSeed,challengeStage,challengeUnlockLevel,challengeUsesManualMatchups,
  challengeUsesScheduledRewards,recommendedChallengeDraft,scoreChallenge,
  type ChallengeAction,type ChallengeFixture,type ChallengeRun,
} from '../game/gym/challenge';
import {challengeCards} from '../game/gym/challengeCatalog';
import {assetUrl} from '../presentation/assetUrls';
import {ActionNotice} from './ActionNotice';
import {ChallengeBattle,ChallengeMatchups,ChallengeOpponents,ChallengePortrait} from './GymChallengeBattle';
import {GymChallengeRewards} from './GymChallengeRewards';
import {ChallengeRosterDialog,ChallengeStarters,type ChallengeRosterView} from './GymChallengeRoster';
import {ComicDialog} from './ComicDialog';
import {TierBadge} from './TierBadge';
import './GymChallenge.css';

type Controls = {busy:boolean;act:(action:ChallengeAction)=>Promise<boolean>};
type ReviveAction = Extract<ChallengeAction,{type:'revive-challenge'}>;
type PlatformControls = {rewardAvailable:boolean;adLoading:boolean;reviveDialogOpen?:boolean;onRevive:(action:ReviveAction)=>void;onReturnToGym:()=>void};

export function GymChallengeEntry({state,open,busy}:{state:GymState;open:()=>void;busy:boolean}) {
  const unlocked=challengeCanStart(state);
  const run=state.challenge?.run;
  const label=!unlocked&&!run?`球馆 ${challengeUnlockLevel} 级解锁`:
    !run||run.retired?'三人组队闯关':run.phase==='lost'?'查看战报':run.phase==='draft'?'继续选择首发':`继续第 ${challengeStage(run)} 关`;
  return <button type="button" className="gc-entry" disabled={busy} onClick={open}><strong>球馆挑战</strong><span>{label}</span><b aria-hidden="true">›</b></button>;
}

function ChallengeLayout({view,roster,action,note,children}:{view:string;roster?:ReactNode;action:ReactNode;note?:string;children:ReactNode}) {
  const body=useRef<HTMLDivElement>(null);
  useEffect(()=>{if (body.current) body.current.scrollTop=0;},[view]);
  return <div className={`gc-panel${roster?' gc-panel-roster':''}`}>
    {roster}
    <div className="gc-scroll" ref={body}><div className="gc-content">{children}</div></div>
    <footer className="gc-dock">
      <div>{note&&<small>{note}</small>}{action}</div>
    </footer>
  </div>;
}

function StatPreview({stats}:{stats:Stats}) {
  return <span className="gc-draft-stats">{statKeys.map(key=><span key={key}>{statLabels[key]} <b>{stats[key]}</b></span>)}</span>;
}

function Draft({run,seed,pool,fixture,busy,act,error,rewardAvailable,adLoading}:Controls & Pick<PlatformControls,'rewardAvailable'|'adLoading'> & {run:ChallengeRun;seed:number;pool:string[];fixture:ChallengeFixture;error:string}) {
  const offered=challengeDraft(seed,pool,run.startPoolSize,run.rulesVersion,run.settings,run.draftRefreshed);
  const signedPool=pool.slice(0,run.startPoolSize);
  const [selected,setSelected]=useState(()=>run.rulesVersion?[]:recommendedChallengeDraft(offered,fixture));
  const pick=(id:string)=>setSelected(ids=>ids.includes(id)?ids.filter(other=>other!==id):ids.length<3?[...ids,id]:ids);
  return <ChallengeLayout view="draft" note={`已选 ${selected.length} / 3 人`} action={<>
    {challengeUsesScheduledRewards(run.rulesVersion)&&!run.draftRefreshed&&
      <button type="button" className="gc-stamp gc-stamp-yellow gc-draft-refresh" disabled={busy||adLoading||!rewardAvailable}
        aria-busy={adLoading} title={rewardAvailable?undefined:'请在支持激励广告的虎扑客户端使用'}
        onClick={()=>void act({type:'refresh-challenge-draft',attempt:run.attempt})}>
        <svg viewBox="0 0 24 20" aria-hidden="true"><rect x="1.5" y="2" width="21" height="16" rx="2"/><path d="m10 6 6 4-6 4Z"/></svg>
        {adLoading?'正在加载广告…':'刷新·必定出巨星'}
      </button>}
    <button type="button" className="gc-stamp" disabled={busy||adLoading||selected.length!==3}
      onClick={()=>void act({type:'draft-challenge',attempt:run.attempt,players:selected})}>确认首发</button>
  </>}>
    <div className="gc-section-head"><h2>选择首发</h2><b>{selected.length} / 3</b></div>
    <div className="gc-fixture-strip"><b>{run.checkpoint?`第 ${fixture.stage} 关项目`:'首关项目'}</b>{fixture.lanes.map(lane=><span key={lane.key}>{statLabels[lane.key]}</span>)}</div>
    <div className="gc-draft">{offered.map(id=>{
      const card=challengeCards.get(id)!,chosen=selected.includes(id);
      const entrant=challengeEntrant(id,run.settings);
      const stats=run.settings?{...card.stats}:card.stats;
      if (run.settings) for (const key of statKeys) stats[key]=challengePower(entrant,key,run.boosts,run.settings,run.rulesVersion)/100;
      return <button type="button" key={id} className="gc-draft-player" aria-pressed={chosen} disabled={busy||adLoading||!chosen&&selected.length===3} onClick={()=>pick(id)}>
        <ChallengePortrait id={id} className="gc-draft-photo"/>
        <span className="gc-draft-body"><strong>{card.name} <TierBadge tier={card.tier}/>
          {run.settings&&<small>Lv.{entrant.level}</small>}
          {run.rulesVersion===2&&!signedPool.includes(id)&&<small>临时</small>}</strong><StatPreview stats={stats}/></span>
        <span aria-hidden="true" className="gc-tick">{chosen?'✓':'＋'}</span>
      </button>;
    })}</div>
    <ActionNotice message={error} role="alert"/>
  </ChallengeLayout>;
}

function UnlockProgress({state}:{state:GymState}) {
  return <div className="gc-gates" aria-label="开启条件">
    <div><span>球馆等级</span><b>Lv.{state.gymLevel} <small>/ Lv.{challengeUnlockLevel}</small></b></div>
  </div>;
}

function Lobby({state,busy,act,error}:Controls & {state:GymState;error:string}) {
  const unlocked=challengeCanStart(state);
  const attempt=state.challenge?.run.attempt??0;
  const checkpoint=challengeCheckpoint(state.challenge);
  return <ChallengeLayout view="lobby" action={<>
    {unlocked&&checkpoint>0&&<button type="button" className="gc-stamp gc-stamp-yellow gc-checkpoint" disabled={busy}
      onClick={()=>void act({type:'start-challenge',attempt,checkpoint})}>快速通过 {checkpoint} 关</button>}
    <button type="button" className="gc-stamp" disabled={busy||!unlocked} onClick={()=>void act({type:'start-challenge',attempt})}>
      {unlocked?'组建挑战队':'球馆挑战未解锁'}
    </button>
  </>}>
    <div className="gc-arena">
      <img src={assetUrl('art/shot/court-clean.png')} alt="" />
      <div><small>传奇球馆</small><h2>球馆挑战</h2><p>挑选首发，连战闯关</p></div>
    </div>
    {unlocked?<>
      <p className="gc-note">从五名候选球员中选出三名首发。成功推荐签约可提高对应球员的初始等级。</p>
      {checkpoint>0&&<p className="gc-note">历史最高 {challengeBest(state.challenge)} 关。快速闯关会补领前 {checkpoint} 关的奖励，再从第 {checkpoint+1} 关开打。</p>}
    </>:<>
      <div className="gc-section-head"><h2>开启条件</h2></div><UnlockProgress state={state}/>
    </>}
    <ActionNotice message={error} role="alert"/>
  </ChallengeLayout>;
}

type PanelProps=Controls & PlatformControls & {state:GymState;error:string;reduced:boolean};

export function GymChallengePanel(props:PanelProps) {
  const {state,busy,act,error,rewardAvailable,adLoading}=props;
  const challenge=state.challenge,run=challenge?.run;
  if (!run||run.retired) return <Lobby state={state} busy={busy} act={act} error={error}/>;
  const pool=challengePlayerPool(state,run.rulesVersion),seed=challengeSeed(state.seed,run.attempt);
  if (run.phase==='draft') return <Draft key={`${run.attempt}:${run.draftRefreshed??false}`} run={run} seed={seed} pool={pool}
    fixture={challengeFixture(seed,(run.checkpoint??0)+1,run.rulesVersion)} busy={busy} act={act} error={error} rewardAvailable={rewardAvailable} adLoading={adLoading}/>;
  return <ChallengeMatch {...props} run={run} seed={seed} pool={pool}/>;
}

const milestoneLabels = {team:'强化全队',swap:'招募新球员',gear:'获取装备',level:'升级两名球员'};

function DefeatDialog({run,stage,reduced,busy,error,rewardAvailable,onRevive,onLeave}:Pick<PanelProps,'reduced'|'busy'|'error'|'rewardAvailable'|'onRevive'> & {run:ChallengeRun;stage:number;onLeave:()=>void}) {
  const firstAction=useRef<HTMLButtonElement>(null);
  const fallback=useRef<HTMLButtonElement>(null);
  const canRevive=rewardAvailable&&!run.revival;
  useEffect(()=>{(canRevive?firstAction:fallback).current?.focus({preventScroll:true});},[canRevive]);
  return <ComicDialog title="挑战落败" className={`gc-dialog gc-defeat-dialog${reduced?' reduce-motion':''}`} onClose={onLeave} dismissible={false} priority={1}
    footer={<div className="gc-defeat-actions">
      <button type="button" ref={firstAction} className="gc-stamp" disabled={busy||!canRevive}
        title={!rewardAvailable?'请在支持发帖的虎扑客户端使用':undefined}
        onClick={()=>onRevive({type:'revive-challenge',attempt:run.attempt,stage})}>{run.revival?'本轮复活机会已用':'分享·复活并获得强力援助'}</button>
      <button type="button" ref={fallback} className="gc-stamp gc-stamp-navy" disabled={busy} onClick={onLeave}>返回球馆</button>
    </div>}>
    <div className="gc-sheet" aria-busy={busy}>
      <p className="gc-defeat-summary">止步第 <b>{stage}</b> 关 <small>已通过 {stage-1} 关</small></p>
      <div className="gc-section-head"><h3>我的首发阵容</h3></div>
      <ul className="gc-defeat-roster">{run.team.map(player=>{
        const card=challengeCards.get(player.id)!;
        return <li key={player.id}><ChallengePortrait id={player.id}/><span><strong>{card.name}</strong><small><TierBadge tier={card.tier}/> Lv.{player.level}</small></span></li>;
      })}</ul>
      {canRevive&&<p>分享后可招募一名援助球员，候选必出 1 名巨星。随后重试本关。</p>}
      <ActionNotice message={error} role="alert"/>
    </div>
  </ComicDialog>;
}

function ChallengeMatch({state,run,seed,pool,busy,act,error,reduced,rewardAvailable,reviveDialogOpen,onRevive,onReturnToGym}:PanelProps & {run:ChallengeRun;seed:number;pool:string[]}) {
  const stage=challengeStage(run),best=challengeBest(state.challenge);
  const rulesVersion=run.rulesVersion;
  const fixture=useMemo(()=>challengeFixture(seed,stage,rulesVersion),[seed,stage,rulesVersion]);
  const [animateStage,setAnimateStage]=useState<number|null>(null);
  const [playback,setPlayback]=useState<{fixture:ChallengeFixture;score:ReturnType<typeof scoreChallenge>}|null>(null);
  const [selectedLane,setSelectedLane]=useState<number|null>(null);
  const selectedSlot=useRef<HTMLButtonElement|null>(null);
  const [view,setView]=useState<ChallengeRosterView|{kind:'reward'}|null>(null);
  const [closedAutomaticReward,setClosedAutomaticReward]=useState<string>();
  const isReady=run.phase==='ready',won=run.phase==='reward';
  const manual=challengeUsesManualMatchups(rulesVersion);
  const scheduled=challengeUsesScheduledRewards(rulesVersion);
  const incomplete=manual&&!challengeMatchesAssigned(run);
  const settlingCheckpoint=won&&run.checkpoint!==undefined&&stage<=run.checkpoint;
  const aid=won&&run.revival?.stage===stage&&!run.revival.move;
  const automaticReward=settlingCheckpoint||aid;
  const automaticRewardKey=`${stage}:${aid?'aid':'checkpoint'}:${run.rewardCategory??''}`;
  const score=useMemo(()=>isReady||automaticReward?null:scoreChallenge(run,fixture,run.assignments),[isReady,automaticReward,run,fixture]);
  const playing=!!playback||!isReady&&animateStage===stage;
  const loss=scheduled&&run.phase==='lost'&&!playing;
  const rewardOpen=won&&!playing&&(view?.kind==='reward'||!view&&automaticReward&&closedAutomaticReward!==automaticRewardKey);
  const finish=useCallback(()=>{setAnimateStage(null);setPlayback(null);},[]);
  const openRoster=(next:ChallengeRosterView)=>{selectedSlot.current=null;setSelectedLane(null);setView(next);};
  const close=()=>setView(null);

  useEffect(()=>{
    if (selectedLane!==null||busy||!isReady) return;
    selectedSlot.current?.focus({preventScroll:true});
    selectedSlot.current=null;
  },[selectedLane,busy,isReady]);

  async function chooseStarter(playerId:string) {
    if (busy||!isReady||selectedLane===null) return;
    const ok=await act({type:'assign-challenge-matchup',attempt:run.attempt,stage,lane:selectedLane,playerId});
    if (ok) setSelectedLane(null);
  }

  async function play() {
    if (busy||!isReady||incomplete) return;
    setSelectedLane(null);
    const command={type:'play-challenge',attempt:run.attempt,stage} as const;
    if (scheduled) {
      const result=scoreChallenge(run,fixture,run.assignments);
      if (await act(command)) setPlayback({fixture,score:result});
    } else {
      setAnimateStage(stage);
      if (!await act(command)) finish();
    }
  }
  async function leaveDefeat() {
    await act({type:'retire-challenge-run',attempt:run.attempt,stage});
    onReturnToGym();
  }
  const action=playing?{label:'对战中…',disabled:true,activate:undefined}:
    isReady?{label:'开始挑战',disabled:busy||incomplete,activate:()=>void play()}:
    won?{label:aid?'领取强力援助':'选择奖励',disabled:busy,activate:()=>setView({kind:'reward'})}:
    {label:'重新组队',disabled:busy||!challengeCanStart(state),activate:()=>void act({type:'start-challenge',attempt:run.attempt})};

  const firstWin=state.challenge?.record?.attempt===run.attempt&&best===stage;
  const picking=manual&&isReady&&selectedLane!==null
    ?{lane:selectedLane,stat:fixture.lanes[selectedLane].key,choose:(id:string)=>void chooseStarter(id)}:undefined;
  const cleared=won&&!aid?stage:stage-1;
  const next=scheduled?challengeNextMilestone(cleared):undefined;
  const note=playing||loss?undefined:settlingCheckpoint?`快速闯关 · 补领第 ${stage} 关奖励`:
    next?`再过 ${next.stage-cleared} 关可${next.categories.length===2?'获取装备并升级两名球员':milestoneLabels[next.category]}`:
    isReady&&incomplete?'为三项对位各安排一名首发':won?`第 ${stage} 关已通过`:!isReady?`本局通过 ${stage-1} 关`:undefined;
  const checkpoint=challengeCheckpoint(state.challenge);
  const battle=playback??(score?{fixture,score}:null);
  return <>
    <ChallengeLayout view={`${stage}-${run.phase}`} note={note}
      roster={<ChallengeStarters run={run} disabled={busy||playing||loss} open={openRoster} selection={picking}/>}
      action={!loss&&<>
        {!scheduled&&run.phase==='lost'&&checkpoint>0&&<button type="button" className="gc-stamp gc-stamp-yellow gc-checkpoint" disabled={busy}
          onClick={()=>void act({type:'start-challenge',attempt:run.attempt,checkpoint})}>快速通过 {checkpoint} 关</button>}
        <button type="button" className="gc-stamp" disabled={action.disabled} onClick={action.activate}>{action.label}</button>
      </>}>
      {battle?<ChallengeBattle key={battle.fixture.stage} fixture={battle.fixture} score={battle.score} animate={playing} reduced={reduced} onComplete={finish}/>:
        automaticReward?<div className="gc-queued-reward">
          <h2>{aid?'强力援助':'快速闯关'}</h2>
          <p>{aid?`选一名援助球员，随后重试第 ${stage} 关。`:`领取第 ${stage} 关奖励，完成后从第 ${(run.checkpoint??0)+1} 关开打。`}</p>
        </div>:isReady&&(manual?<ChallengeMatchups fixture={fixture} run={run} selected={selectedLane} disabled={busy}
        pick={(lane,button)=>{selectedSlot.current=button;setSelectedLane(current=>current===lane?null:lane);}}/>:<ChallengeOpponents fixture={fixture}/>)}
      {!isReady&&!playing&&!automaticReward&&(won
        ?<p className="gc-settlement">{firstWin?`首次通过 · 球馆声望 +${challengeFamePerStage}`:'本关已通过，可领取奖励'}</p>
        :<div className="gc-loss"><span>本局通过 <b>{stage-1}</b> 关</span><span>历史最高 <b>{best}</b> 关</span></div>)}
      {!view&&!loss&&!rewardOpen&&<ActionNotice message={error} role="alert"/>}
    </ChallengeLayout>
    {loss&&!reviveDialogOpen&&<DefeatDialog run={run} stage={stage} busy={busy} reduced={reduced} error={error} rewardAvailable={rewardAvailable} onRevive={onRevive} onLeave={()=>void leaveDefeat()}/>}
    {rewardOpen&&<GymChallengeRewards run={run} seed={seed} pool={pool} busy={busy} act={async action=>{
      const ok=await act(action);
      if (ok&&action.type==='take-challenge-reward'&&!(scheduled&&run.rewardCategory==='gear'&&challengeScheduledRewards(stage).length===2)) close();
    }} onClose={()=>{setClosedAutomaticReward(automaticRewardKey);close();}} error={error} reduced={reduced}/>}
    {view&&view.kind!=='reward'&&!loss&&<ChallengeRosterDialog view={view} open={openRoster} run={run} busy={busy} reduced={reduced} error={error} close={close} act={act}/>}
  </>;
}
