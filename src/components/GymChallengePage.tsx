import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ComicDialog} from './ComicDialog';
import {GymHomeIcon} from './GymHomeArt';
import './GymChallengePage.css';

type Props = {
 home: boolean;
 blocked: boolean;
 busy: boolean;
 reduced: boolean;
 manualMatchups: boolean;
 scheduledRewards?: boolean;
 lossLocked?: boolean;
 onBack: () => void;
 children: ReactNode;
};

export function GymChallengePage({home, blocked, busy, reduced, manualMatchups, scheduledRewards=false, lossLocked=false, onBack, children}: Props) {
 const heading = useRef<HTMLHeadingElement>(null);
 const [rules,setRules] = useState(false);
 useEffect(() => {
  if (!blocked&&!lossLocked) heading.current?.focus({preventScroll:true});
 }, [blocked,lossLocked]);

 return <main className={`game-screen gym-challenge-page${reduced?' reduce-motion':''}`} aria-labelledby="gym-challenge-title" ref={element => {if (element) element.inert = blocked||rules||lossLocked;}}>
  <header className="gym-challenge-banner">
   <div className="gym-challenge-banner-content">
    <button type="button" className="gym-challenge-back" disabled={busy||lossLocked} onClick={onBack}>
     <GymHomeIcon name="arrow"/>{home ? '返回首页' : '返回训练场'}
    </button>
    <h1 id="gym-challenge-title" ref={heading} tabIndex={-1}>球馆挑战</h1>
    <button type="button" className="gym-challenge-help" aria-label="玩法说明" disabled={busy||lossLocked} onClick={()=>setRules(true)}>?</button>
   </div>
  </header>
  {children}
  {rules&&!blocked&&!lossLocked&&<ComicDialog title="玩法说明" className="gc-dialog" onClose={()=>setRules(false)}>
   <dl className="gc-rules-sheet">
    <div><dt>组队</dt><dd>从五名候选中选三人首发。{manualMatchups&&(scheduledRewards?'本轮最多招募至六人，每关选三人出战。':'赛前可与最多三名备战球员互换。')}每次成功推荐签约，该模板的挑战初始等级 +1。</dd></div>
    <div><dt>对战</dt><dd>{manualMatchups?'在左侧空位安排首发，每人比一项。':'三名首发自动分配对位，每人比一项。'}双方各项能力除以 4，四舍五入后相加。平分也可过关。</dd></div>
    {scheduledRewards?<>
      <div><dt>奖励</dt><dd>每 5 关获取装备，每 10 关另外升级两人。每 3 关招募球员，装备和升级优先。其余关卡自动提升一项属性。</dd></div>
      <div><dt>进度</dt><dd>每关首次通过奖励 6 声望。快速闯关可从已通过的整十关后继续，并补领此前的奖励。</dd></div>
    </>:<div><dt>奖励</dt><dd>每胜一关可选一种强化。{manualMatchups&&'本局招募品质随关卡提高。'}每关首次通过奖励 6 声望，落败后可重新组队。</dd></div>}
   </dl>
  </ComicDialog>}
 </main>;
}
