import {useEffect, useRef, useState} from 'react';
import GymGame from './GymGame';
import {ComicDialog} from './ComicDialog';
import {GymTutorialSpotlight} from './GymTutorialSpotlight';
import {createGymTutorialStore, gymTutorialAfterAction, gymTutorialAfterPanel, gymTutorialGuide, prepareGymTutorialSecondUpgrade, type GymTutorialStep} from '../presentation/gymTutorial';
import {PlayerProfileNetworkContext} from '../platform/usePlayerProfile';
import {useModalAccessibility} from '../presentation/useModalAccessibility';
import './GymTutorial.css';

/** The original game screen runs a disposable, in-memory gym for this lesson. */
export function GymTutorial({onComplete, onSkip, error = ''}: {onComplete: () => void; onSkip?: () => void; error?: string}) {
 const [practice] = useState(createGymTutorialStore), store = practice();
 const [step, setStep] = useState<GymTutorialStep>('intro'), stepRef = useRef(step); stepRef.current = step;
 useModalAccessibility(step === 'intro' || step === 'complete');
 useEffect(() => {
  const present = document.body.classList.contains('gym-tutorial-active'); document.body.classList.add('gym-tutorial-active');
  return () => {if (!present) document.body.classList.remove('gym-tutorial-active');};
 }, []);
 useEffect(() => {
  const selectedHeight = (event: MouseEvent) => {
   if (stepRef.current === 'recruit-height' && event.target instanceof Element && event.target.closest('.gm-recruit-height button[data-preference]')) setStep('recruit-confirm');
  };
  document.addEventListener('click', selectedHeight, true);
  return () => document.removeEventListener('click', selectedHeight, true);
 }, []);
 const finish = (skip = false) => {setStep('complete'); if (skip && onSkip) onSkip(); else onComplete();};
 const guide = gymTutorialGuide(step, store.state);
 if (guide && step === 'club') guide.description = <>球馆 2 级开放<strong className="gym-tutorial-emphasis">多训练位、自动训练、离线训练</strong>。继续招募、培养和推荐球员，用赞助券建设球馆、购置器材。</>;
 const next = () => {
  const current = stepRef.current;
  if (current === 'xp-first') setStep('train-first');
  else if (current === 'growth-first') {prepareGymTutorialSecondUpgrade(practice); setStep('xp-second');}
  else if (current === 'xp-second') setStep('train-second');
  else if (current === 'growth-template') setStep('recommend-open');
  else if (current === 'rewards') setStep('club-open');
  else if (current === 'club') finish();
 };
 return <PlayerProfileNetworkContext.Provider value={false}><div className="gym-tutorial-practice" data-step={step}>
  <GymGame onHome={() => {}} storeHook={practice} tutorial onTutorialAction={(action, result) => setStep(current => gymTutorialAfterAction(current, action, result))} onTutorialPanel={panel => setStep(current => gymTutorialAfterPanel(current, panel))}/>
  {step === 'intro' && <ComicDialog title="开馆第一课" className="gym-tutorial-welcome" onClose={() => {}} dismissible={false}><div className="gym-tutorial-welcome-content"><span className="gym-tutorial-ball" aria-hidden="true">🏀</span><h3>你，就是这家球馆的馆主</h3><p>从招募新人开始，陪球员训练、解锁球星模板，再推荐他们签约。用赚到的声望和赞助券，把小球馆一步步经营起来。</p><ol><li><b>01</b> 招募新人</li><li><b>02</b> 训练解锁模板</li><li><b>03</b> 推荐获得奖励</li><li><b>04</b> 升级经营球馆</li></ol><p className="gym-tutorial-practice-note">这是独立练习。练习中的球员、奖励和操作不计入正式球馆。</p><button type="button" className="primary" onClick={() => setStep('recruit-open')}>开始练习</button></div></ComicDialog>}
  {guide && <GymTutorialSpotlight guide={guide} step={step} onNext={next} onSkip={() => finish(true)}/>}
  {step === 'complete' && <ComicDialog title="练习已完成" className="gym-tutorial-welcome" onClose={() => {}} dismissible={false}><div className="gym-tutorial-welcome-content"><h3>准备好经营自己的球馆了</h3><p>招募新人 → 训练解锁模板 → 推荐赚取奖励 → 升级球馆。</p>{error && <p role="alert">{error}</p>}<button type="button" className="primary" onClick={onComplete}>进入球馆</button></div></ComicDialog>}
 </div></PlayerProfileNetworkContext.Provider>;
}
export default GymTutorial;
