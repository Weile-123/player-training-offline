import {useEffect, useId, useRef, useState, useSyncExternalStore} from 'react';
import {gymLeaderboard, gymLeaderboardConfigured, gymRankReference, type GymRanking} from '../platform/gymLeaderboard';
import {useGym} from '../gymStore';
import {templateById} from '../game/templates';
import {overallRating} from '../game/matching';
import {money} from '../presentation/money';
import {ActionNotice} from './ActionNotice';

/** Keep the original game's ranking layout, medal podium and personal-score strip. */
export function GymLeaderboard() {
 const [tab, setTab] = useState(0), [refresh, setRefresh] = useState(0), [data, setData] = useState<GymRanking | null>(null);
 const [loading, setLoading] = useState(true), [error, setError] = useState('');
 const [syncFailed,setSyncFailed]=useState(false);
 const localOnly=useGym.getState().authorityMode==='local';
 const id = useId(), buttons = useRef<(HTMLButtonElement | null)[]>([]);
 const message = useSyncExternalStore(gymLeaderboard.subscribe, gymLeaderboard.getMessage, gymLeaderboard.getMessage);
 useEffect(() => {
  let active = true; setLoading(true); setData(null); setError(''); setSyncFailed(false);
  void (async () => {
   if (!localOnly && gymLeaderboardConfigured() && useGym.getState().hasSave) {
    try {await gymLeaderboard.sync(gymRankReference(useGym.getState().state));}
    catch {if(active)setSyncFailed(true); /* Public reads remain available; the failure stays visible. */}
   }
   return gymLeaderboard.list(tab === 0 ? 'player' : 'fame');
  })().then(result => {if (active) setData(result);}).catch(error => {if (active) setError(error instanceof Error ? error.message : '排行榜读取失败');}).finally(() => {if (active) setLoading(false);});
  return () => {active = false;};
 }, [tab, refresh, localOnly]);
 const bestName = (templateId?: string) => templateById(templateId)?.name ?? '球员';
 const bestTags = (player: NonNullable<GymRanking['entries'][number]['best']>) => <><span>训练 +{player.level}</span><span>综评 {overallRating(player.stats).toFixed(1)}</span></>;
 return <div className="leaderboard gym-leaderboard">
  <div className="leaderboard-tabs" data-index={tab} role="tablist" aria-label="排行榜分类">{['球员榜', '声望榜'].map((label, index) => <button key={label} ref={element => {buttons.current[index] = element;}} id={`${id}-tab-${index}`} role="tab" aria-selected={tab === index} aria-controls={`${id}-panel`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={event => {if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index; setTab(next); buttons.current[next]?.focus();}}>{label}</button>)}</div>
  <div className={`leaderboard-personal online-personal${tab === 0 ? ' is-player' : ''}`} aria-busy={loading}>
   {data?.me && !loading ? <><div className="personal-coach"><span className="personal-place">第 {data.me.rank} 名</span><strong>{data.me.entry.coach}</strong><small>我的排名</small></div>{tab === 0 && <div className="personal-player"><strong>{bestName(data.me.entry.best?.templateId)}</strong>{data.me.entry.best && <div className="personal-tags">{bestTags(data.me.entry.best)}</div>}</div>}<b className="personal-score">{tab === 0 ? money(data.me.entry.score) : `${data.me.entry.score} 声望`}</b></> : <div><small>我的排名</small><strong>{loading ? '加载中…' : error || data?.personalError ? '暂未获取排名' : '暂无排名'}</strong></div>}
  </div>
  <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="leaderboard-page" aria-busy={loading}>
   {loading ? <p role="status">正在读取排行榜…</p> : error ? <p role="alert">{error}</p> : !data?.entries.length ? <p>暂无已提交的成绩</p> : <ol className={`leaderboard-list ${tab === 0 ? 'player-ranking' : 'endless-ranking'}`} tabIndex={0} aria-label="排行榜前50名">{data.entries.map((row, index) => <li key={row.id}><div className="leaderboard-coach"><span className="leaderboard-rank" data-place={index + 1}>{index + 1}</span><strong>{row.coach}</strong></div>{tab === 0 ? <><div className="leaderboard-template"><strong>{bestName(row.best?.templateId)}</strong>{row.best && <div>{bestTags(row.best)}</div>}</div><b className="leaderboard-value">{money(row.score)}</b></> : <b className="leaderboard-month"><em>{row.score}</em> 声望</b>}</li>)}</ol>}
  </section>
  <button type="button" className="secondary" disabled={loading} onClick={() => setRefresh(value => value + 1)}>刷新排行榜</button>
  <ActionNotice message={data?.personalError||message} role={data?.personalError||syncFailed||/失败|不可用|未确认|未连接|切换|暂无已验证/.test(message)?'alert':'status'} className="leaderboard-action-notice"/>
  <p className="leaderboard-note">每人保留最高身价、最高声望 · 同分先达到者在前。</p>
  <p className="leaderboard-note">{localOnly?'当前展示此前已同步的排名；本机新成绩尚未接入独立排行同步。':'排行榜仅记录平台新建球馆的已验证成绩；迁入的旧球馆保留经营进度，不参与排名。'}</p>
 </div>;
}
