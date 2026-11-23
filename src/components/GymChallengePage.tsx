import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ComicDialog} from './ComicDialog';
import {GymHomeIcon} from './GymHomeArt';
import './GymChallengePage.css';

type Props = {
 blocked: boolean;
 busy: boolean;
 reduced: boolean;
 manualMatchups: boolean;
 scheduledRewards?: boolean;
 lossLocked?: boolean;
 onBack: () => void;
 onAbandon?: () => Promise<void>;
 abandonError: string;
 children: (showRules:()=>void) => ReactNode;
};

export function GymChallengeRules({manualMatchups,scheduledRewards=false}:Pick<Props,'manualMatchups'|'scheduledRewards'>) {
 const manual=manualMatchups||scheduledRewards;
 return <dl className="gc-rules-sheet">
  <div><dt>组队</dt><dd>
   {manual&&<strong className="gc-rules-referral">每次成功推荐签约，对应球员模板的挑战初始等级 <b>+1</b>。</strong>}
   从五名候选中选三人首发。{manual&&(scheduledRewards?'一轮最多招募六人，每关选三人出战。':'赛前可与最多三名备战球员互换。')}
  </dd></div>
  <div><dt>对战</dt><dd>{manual?'在左侧空位安排首发，每人比一项。':'三名首发自动分配对位，每人比一项。'}双方各项能力除以 4，四舍五入后相加。平分也可过关。</dd></div>
  <div><dt>奖励</dt><dd>{scheduledRewards
   ?'每 5 关获取装备，每 10 关另外升级两人。每 3 关可招募球员，装备和升级优先。其余关卡自动提升一项属性，点击「下一关」继续。'
   :`每胜一关可选一种强化。${manual?'本局招募品质随关卡提高。':''}`}</dd></div>
  <div><dt>进度</dt><dd>每关首次通过奖励 6 声望。{scheduledRewards
   ?'快速闯关可从已通过的整十关后继续，并补领此前的奖励。'
   :'落败后可重新组队。'}</dd></div>
 </dl>;
}

export function GymChallengePage({blocked, busy, reduced, manualMatchups, scheduledRewards=false, lossLocked=false, onBack, onAbandon, abandonError, children}: Props) {
 const heading = useRef<HTMLHeadingElement>(null);
 const [dialog,setDialog] = useState<'rules'|'abandon'|null>(null);
 const dialogOpen=dialog!==null&&!blocked&&!lossLocked;
 const closeDialog=()=>setDialog(null);
 useEffect(() => {
  if (!blocked&&!lossLocked) heading.current?.focus({preventScroll:true});
 }, [blocked,lossLocked]);

 return <main className={`game-screen gym-challenge-page${reduced?' reduce-motion':''}`} aria-labelledby="gym-challenge-title" ref={element => {if (element) element.inert = blocked||dialogOpen||lossLocked;}}>
  <header className="gym-challenge-banner">
   <div className="gym-challenge-banner-content">
    <button type="button" className="gym-challenge-back" disabled={busy||lossLocked} onClick={onBack}>
     <GymHomeIcon name="arrow"/>返回训练场
    </button>
    <h1 id="gym-challenge-title" ref={heading} tabIndex={-1}>球馆挑战</h1>
    {onAbandon&&<button type="button" className="gym-challenge-abandon" aria-haspopup="dialog" disabled={busy||lossLocked} onClick={()=>setDialog('abandon')}>放弃挑战</button>}
   </div>
  </header>
  {children(()=>setDialog('rules'))}
  {dialogOpen&&dialog==='rules'&&<ComicDialog title="玩法说明" className="gc-dialog" onClose={closeDialog}>
   <GymChallengeRules manualMatchups={manualMatchups} scheduledRewards={scheduledRewards}/>
  </ComicDialog>}
  {dialogOpen&&dialog==='abandon'&&onAbandon&&<ComicDialog title="放弃本轮挑战？" className="gc-dialog" onClose={closeDialog} dismissible={!busy}
   footer={<div className="gc-abandon-actions">
    <button type="button" className="gc-stamp gc-stamp-navy" disabled={busy} onClick={closeDialog}>继续挑战</button>
    <button type="button" className="gc-stamp" disabled={busy} onClick={()=>void onAbandon()}>确认放弃</button>
   </div>}>
   <div className="gc-sheet" aria-busy={busy}>
    <p>结束本轮挑战并返回训练场。历史最高关数和已结算的声望会保留。</p>
    {abandonError&&<p role="alert">{abandonError}</p>}
   </div>
  </ComicDialog>}
 </main>;
}
