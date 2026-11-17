import {useState} from 'react';
import {postgameRepeatTemplateCredits} from '../game/gym/catalog';
import {cooperationOffers, cooperationStatus, equipmentEffects, playerLevelCap, recommendationPayout, type CooperationOffer} from '../game/gym/engine';
import {ComicDialog} from './ComicDialog';
import {GameIcon} from './GameIcon';
import type {GymPanelProps} from './GymPanels';
import './GymCooperationPanel.css';

const tiers = ['待发掘', '替补', '首发', '全明星', '巨星', '传奇'];
const number = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});

export function GymCooperationPanel({state, onAction, onAdAction, adAction, busy = false}: GymPanelProps) {
  const [pending, setPending] = useState<{offer: CooperationOffer | null; playerId: string; ad?: boolean} | null>(null);
  const [showRules, setShowRules] = useState(false);
  const player = state.player;
  if (!player) return <div className="gym-panel gm-empty"><GameIcon name="handshake"/><h3>先迎接一位新人</h3><p className="gm-muted">招募球员后可选择合作。</p></div>;
  const offers = cooperationOffers(state);
  const status = cooperationStatus(state);
  const repeat = recommendationPayout(state, player).repeatTemplate;
  const ended = player.level >= playerLevelCap;
  const equipmentTier = equipmentEffects(state).cooperationBonus;
  const earnedTier = player.equipmentTraining.cooperationCourses[1] >= 2 ? 2 : player.equipmentTraining.cooperationCourses[0] >= 2 ? 1 : 0;
  const equipmentCourses = equipmentTier > 0 ? player.equipmentTraining.cooperationCourses[equipmentTier - 1] : 0;
  const equipmentShots = equipmentTier > 0 ? player.equipmentTraining.cooperationCourseShots[equipmentTier - 1] : 0;
  const equipmentStatus=earnedTier>0?`已保留额外 ${earnedTier} 券资格，合作达标后推荐领取。`:ended?'训练已结束，未完成课程不再累计。':!status.offer?'接取合作后开始累计。':player.training.shots>equipmentShots?'本课非完整器材课程，下课起重新累计。':status.complete&&equipmentTier>0&&equipmentCourses<2?`合作已达标，器材还差${2-equipmentCourses}整课。`:'完成2个完整器材课程，可获得推荐加奖。';
  const accept = (offer: CooperationOffer) => {
    if (busy || ended) return;
    if (status.offer) setPending({offer, playerId: player.id});
    else onAction({type: 'accept-cooperation', id: offer.id, playerId: player.id});
  };
  const completeWithAd = (offer: CooperationOffer) => {
    if (busy || !onAdAction) return;
    onAdAction({type: 'complete-cooperation-ad', id: offer.id, playerId: player.id, expectedCooperationId: player.cooperation?.id ?? null, expectedCooperationRevision: player.cooperation ? player.cooperation.acceptedRevision ?? 0 : null});
  };
  return <div className="gym-panel gm-cooperation-panel">
    <div className="gm-section-heading"><div><h3>选择合作</h3><p className="gm-muted">任选一份，达标后推荐领取</p></div><button type="button" className="gm-training-help" aria-label="查看合作说明" title="合作说明" onClick={() => setShowRules(true)}>?</button></div>
    {!onAdAction&&<p className="gm-muted" role="status">{ended?'训练已结束，广告奖励暂不可用；已有培养成果仍可推荐结算。':'广告奖励暂不可用，仍可通过训练完成合作。'}</p>}
    {ended && <p className="gm-cooperation-notice" aria-label="满级合作限制">已满级，不能继续训练；已有合作与器材资格保留，可照常推荐结算。{onAdAction&&'也可看广告完成合作。'}</p>}
    {status.offer && ended && !status.complete && <p className="gm-cooperation-status" role="status">训练已结束，当前合作未达标</p>}
    {repeat && <p className="gm-cooperation-repeat" aria-label="重复模板合作结算">重复模板基础{postgameRepeatTemplateCredits}券，培养、合作与器材加奖照常叠加。</p>}
    <div className="gm-cooperation-list">{offers.map(offer => {
      const active = status.offer?.id === offer.id;
      const target = active ? status : cooperationStatus(state, {...player, cooperation: {id: offer.id, playerId: player.id, acceptedShots: player.shots, acceptedCourses: player.training.completedCourses}});
      return <article className={`gm-cooperation${active ? ' is-active' : ''}${active && status.complete ? ' is-ready' : ''}`} key={offer.id}>
        <div className="gm-cooperation-title" role={active && (!ended || status.complete) ? 'status' : undefined}><h4>{offer.name}</h4><span>{active ? player.cooperation?.adCompleted ? '广告已完成' : status.complete ? '已达标' : ended ? '未达标' : '进行中' : ended ? '已满级' : '可选择'}</span></div>
        <div className="gm-cooperation-reward"><span>达标奖励 +{active ? status.rewardCredits : offer.credits} 券</span><span>+{active ? status.rewardFame : offer.fame} 声望</span></div>
        <div className="gm-cooperation-objectives"><div className="gm-cooperation-conditions" aria-hidden={active&&player.cooperation?.adCompleted?true:undefined} style={active&&player.cooperation?.adCompleted?{visibility:'hidden'}:undefined}>{target.requirements.map((requirement, index) => {
          const tierCondition = index === 2;
          const label = index === 0 ? '训练' : index === 1 ? '课程' : tierCondition ? '模板要求' : requirement.label;
          const current = index < 2 ? Math.min(requirement.current, requirement.required) : requirement.current;
          return <div key={requirement.label} className={`gm-cooperation-condition${requirement.met ? ' is-met' : ''}`} aria-label={requirement.label}>
            <span>{label}</span><b>{tierCondition ? `${tiers[offer.requiredTier]}及以上` : `${number.format(current)} / ${number.format(requirement.required)}`}{requirement.met ? ' ✓' : ''}</b>
          </div>;
        })}</div>{active&&player.cooperation?.adCompleted&&<p className="gm-cooperation-ad-done">广告已完成合作，推荐签约时结算。</p>}</div>
        <div className="gm-cooperation-actions"><button type="button" className="gm-button gm-cooperation-ad" aria-label={`看广告一键完成${offer.name}`} title={!onAdAction?'广告奖励暂不可用，请稍后再试':undefined} aria-busy={adAction?.type === 'complete-cooperation-ad' && adAction.id === offer.id} disabled={busy || !onAdAction || active && status.complete} onClick={() => {if (status.offer && !active) setPending({offer, playerId: player.id, ad: true}); else completeWithAd(offer);}}>{adAction?.type === 'complete-cooperation-ad' && adAction.id === offer.id ? <><i className="gym-button-spinner" aria-hidden="true"/><span>加载中…</span></> : <><svg viewBox="0 0 24 20" aria-hidden="true"><rect x="1" y="2" width="22" height="16" rx="2"/><path d="m10 6 6 4-6 4Z"/></svg><span>{onAdAction?'一键完成':'广告暂不可用'}</span></>}</button><button type="button" className={`gm-button${active ? '' : ' gm-primary'}`} disabled={busy || active || ended} onClick={() => accept(offer)}>{active ? status.complete ? '已达标' : '当前合作' : ended ? '满级不可接取' : status.offer ? '更换为此合作' : '接取合作'}</button></div>
      </article>;
    })}</div>
    {(equipmentTier > 0 || earnedTier > 0) && <section className="gm-cooperation-equipment" aria-label="合作器材培养进度">
      <div className="gm-section-heading"><h4>器材加奖</h4>{earnedTier > 0 && <small>资格已保留</small>}</div>
      {equipmentTier > 0 && <p>完整课程 {Math.min(equipmentCourses, 2)}/2 · 本课启用 {equipmentShots}/10 球</p>}
      <p className={`gm-cooperation-equipment-status ${earnedTier>0?'gm-cooperation-earned':'gm-muted'}`}>{equipmentStatus}</p>
    </section>}
    {status.offer && <button type="button" className="gm-info-button gm-cooperation-abandon" disabled={busy} onClick={() => setPending({offer: null, playerId: player.id})}>放弃当前合作</button>}
    {showRules && <ComicDialog title="合作说明" onClose={() => setShowRules(false)}><div className="gym-panel gm-cooperation-rules">
      <section className="gm-stack"><h3>接取与结算</h3><p>每名球员任选一份合作，接取后累计新的训练和课程；所有条件达标后，按推荐时的最终模板结算，推荐签约时领取奖励。</p><p>一键完成：完整观看广告，直接完成这一份合作，奖励仍在推荐时领取。不会增加投篮、课程或器材培养进度。</p><p className="gm-muted">合作没有期限，未完成也可正常推荐，不扣券或声望。更换或放弃合作会清空当前合作进度、未领取奖励和器材资格。</p></section>
      <section className="gm-stack"><h3>合作加奖</h3><table className="gm-cooperation-bonus-table"><thead><tr><th scope="col">合作</th><th scope="col">赞助券</th><th scope="col">声望</th></tr></thead><tbody>{offers.map(offer => <tr key={offer.id}><td>{offer.name}</td><td>+{offer.credits}</td><td>+{offer.fame}</td></tr>)}</tbody></table></section>
      <section className="gm-stack"><h3>器材加奖</h3><p>接取合作后启用合作器材，完成2个完整课程，每课10球都须启用对应器材。取得的资格不会因换下器材消失，合作达标后推荐领取。</p><p className="gm-muted">重复模板基础{postgameRepeatTemplateCredits}券，培养、合作与器材加奖照常叠加，声望照常。</p></section>
      <button type="button" className="gm-button gm-primary" onClick={() => setShowRules(false)}>返回合作</button>
    </div></ComicDialog>}
    {pending && <ComicDialog title={pending.offer ? '更换赞助合作' : '放弃赞助合作'} onClose={() => setPending(null)}><div className="gym-panel">
      <p>{pending.offer ? `确认改接「${pending.offer.name}」？` : '确认放弃当前合作？'}</p><p className="gm-cooperation-notice">当前合作进度、未领取奖励和器材资格将清空。</p><p className="gm-muted">不扣券或声望；球员属性、已完成课程和模板保留。</p>
      {pending.offer && ended && !pending.ad && <p className="gm-cooperation-notice" role="alert">球员已满级，不能确认更换；当前合作和已有器材资格均保留。</p>}
      {pending.ad&&!onAdAction&&<p role="status">广告奖励暂不可用，请稍后再试。</p>}
      <div className="gm-actions"><button type="button" className="gm-button" disabled={busy} onClick={() => setPending(null)}>保留当前合作</button><button type="button" className="gm-button gm-primary" disabled={busy || !!pending.offer && ended && !pending.ad || !!pending.ad&&!onAdAction} onClick={() => {if (busy || pending.offer && ended && !pending.ad || pending.ad&&!onAdAction || pending.playerId !== player.id) return; if (pending.ad && pending.offer) completeWithAd(pending.offer); else onAction(pending.offer ? {type: 'accept-cooperation', id: pending.offer.id, playerId: pending.playerId} : {type: 'abandon-cooperation', playerId: pending.playerId}); setPending(null);}}>{pending.ad ? '观看广告并完成' : pending.offer ? '确认更换' : '确认放弃'}</button></div>
    </div></ComicDialog>}
  </div>;
}
