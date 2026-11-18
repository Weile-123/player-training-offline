import {useEffect, useState} from 'react';
import {GymTutorialSpotlight} from './GymTutorialSpotlight';
import type {GymTutorialGuide} from '../presentation/gymTutorial';
import type {GymFeatureTutorialKind} from '../presentation/gymFeatureTutorialPreference';

export type {GymFeatureTutorialKind} from '../presentation/gymFeatureTutorialPreference';
type Props = {kind: GymFeatureTutorialKind; onComplete: () => void};

/** First-visit explanations point straight at the real controls without performing actions. */
export function GymFeatureTutorial({kind, onComplete}: Props) {
 const [page, setPage] = useState(0);
 useEffect(() => {setPage(0);}, [kind]);
 const guides: GymTutorialGuide[] = kind === 'training' ? [
  {selector: '.gm-training-current, .gym-management-dialog .gm-empty', label: '训练计划', chapter: '1 / 2', title: '完成课程，恢复体力', description: <>每投 <strong>10 次球</strong>可以完成一节课，并恢复 <strong>4 点体力</strong>。</>, next: '下一步'},
  {selector: '.gm-training-directions, .gym-management-dialog .gm-empty', label: '训练计划', chapter: '2 / 2', title: '选择你想培养的方向', description: '选择训练方向可改变球员升级时提升的能力倾向，可用于解锁你偏向解锁的球员模板。', next: '知道了'},
 ] : [
  {selector: '.gm-cooperation-list, .gym-management-dialog .gm-empty', label: '赞助合作', chapter: '1 / 1', title: '完成合作，领取额外奖励', description: '选择不同难度的赞助合作，达成要求后可获得额外赞助券和声望奖励。', next: '知道了'},
 ];
 const current = Math.min(page, guides.length - 1);
 return <GymTutorialSpotlight guide={guides[current]} step={`feature-${kind}-${current + 1}`} skippable={false} onNext={() => {if (current + 1 < guides.length) setPage(current + 1); else onComplete();}}/>;
}
export default GymFeatureTutorial;
