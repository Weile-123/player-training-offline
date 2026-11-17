import {Fragment, useState} from 'react';
import type {OfflinePlayerReport, OfflineTrainingReport} from '../game/gym/offline';
import {tierConfig} from '../game/matching';
import {templateById} from '../game/templates';
import {gymPlayerName} from '../presentation/gymPlayerName';
import {offlineDuration} from '../presentation/offlineDuration';
import {decodePreferences, presentationConfig} from '../presentation/feedback';
import {ComicDialog} from './ComicDialog';
import {StarPortrait, templatePortrait} from './PlayerTemplatePanel';
import './GymDesignSystem.css';
import './GymOfflineReport.css';

const number = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});

/** Keep numbers and units separate, exactly as the selected report design. */
function DurationValue({milliseconds, className}: {milliseconds: number; className?: string}) {
  const parts = [...offlineDuration(milliseconds).matchAll(/(\d+)(小时|分钟|秒)/g)];
  return <b className={className}>{parts.map(([text, value, unit]) => <Fragment key={text}>{value}<small>{unit}</small></Fragment>)}</b>;
}

function OfflinePlayerCard({player}: {player: OfflinePlayerReport}) {
  const template = templateById(player.templateAfter);
  const name = gymPlayerName({templateId: player.templateAfter, name: player.name});
  const changed = player.templateBefore !== player.templateAfter;
  const originalName = templateById(player.templateBefore)?.name ?? '待发掘';
  const finalName = template?.name ?? '待发掘';
  const tier = template?.tier ?? 'undiscovered';
  return <article className="report-athlete gm-offline-athlete" aria-label={`${name}离线培养成果`}>
    <div className="athlete-cover gm-offline-athlete-cover">
      <span className="gm-offline-portrait tier-portrait-frame" data-tier={tier}><span className="album-portrait-surface"><StarPortrait src={templatePortrait(player.templateAfter)} name={name}/></span></span>
      <div><h3>{name}</h3><small>{template ? tierConfig(template.tier).label : '待发掘'}</small></div>
    </div>
    <div className="athlete-growth gm-offline-athlete-growth">
      <div className="athlete-level gm-offline-level-flow"><span><small>Lv.</small>{player.levelBefore}</span><small aria-hidden="true">→</small><strong>{player.levelAfter}</strong></div>
      <p className="athlete-xp gm-offline-athlete-xp">经验 +{number.format(player.xpGained)}</p>
      <div className="athlete-stat"><span>完成投篮</span><b>{number.format(player.shots)} 球</b></div>
      <div className="athlete-stat"><span>完整课程</span><b>{number.format(player.courses)} 课</b></div>
      <div className="athlete-template gm-offline-template">
        {changed ? <>模板变化<strong className="gm-offline-template-change" title={`${originalName} → ${finalName}`}><span className="gm-offline-template-before">{originalName}</span><i aria-hidden="true"> → </i><span className="gm-offline-template-after">{finalName}</span></strong></> : <>培养记录已更新<strong className="gm-offline-template-unchanged">模板保持不变</strong></>}
      </div>
    </div>
  </article>;
}

/** An already-saved report, using the chosen B design without a second layout system. */
export function GymOfflineReport({report, onClose}: {report: OfflineTrainingReport; onClose: () => void}) {
  const [reduced] = useState(() => {
    try { return decodePreferences(localStorage.getItem(presentationConfig.preferenceKey)).reducedMotion; }
    catch { return false; }
  });
  return <ComicDialog title="离线训练报告" className="gym-design-dialog gym-offline-dialog" priority={1} onClose={onClose}>
    <div className={`gym-design-surface offline-b gm-offline-report${reduced ? ' reduce-motion' : ''}`}>
      <section className="report-dashboard gm-offline-scoreboard" aria-label="离线训练结算">
        <div className="report-dashboard-top"><h2>离线训练结算</h2><small>● 已保存</small></div>
        <div className="report-dashboard-primary gm-offline-xp-total"><b>+{number.format(report.totalExperience)}</b><span>总经验 XP</span></div>
        <div className="report-dashboard-metrics gm-offline-metrics"><div><span>计入时长</span><DurationValue milliseconds={report.creditedMs}/></div><div><span>完成投篮</span><b>{number.format(report.totalShots)}<small>球</small></b></div><div><span>本次离开</span><DurationValue milliseconds={report.elapsedMs} className="duration"/></div></div>
      </section>
      {report.capped && <p className="cap-note gm-offline-cap-note"><b aria-hidden="true">!</b><span>本次已按{offlineDuration(report.capMs)}上限结算；超出时长仅恢复体力。</span></p>}
      <section className="gm-offline-results" aria-label="本次培养成果">
        <div className="result-heading"><h2>本次培养成果</h2><small>{report.players.length} 位自动训练球员</small></div>
        {report.players.length ? <div className="player-columns gm-offline-players" role="region" aria-label="球员离线成果，可左右滑动" tabIndex={0}>{report.players.map(player => <OfflinePlayerCard key={player.id} player={player}/>)}</div> : <p className="gm-offline-empty">本次没有产生有效训练。</p>}
      </section>
      <div className="offline-summary gm-offline-saved" role="status"><span className="tick" aria-hidden="true">✓</span><div><strong>训练成果已计入球馆</strong><small>等级、属性、课程与模板已保存，无需领取。</small></div></div>
      <div className="report-bottom gm-offline-footer"><p>赞助券需推荐签约获得；离线不会自动推荐或补招。</p><button type="button" className="primary" onClick={onClose}>继续培养</button></div>
    </div>
  </ComicDialog>;
}
