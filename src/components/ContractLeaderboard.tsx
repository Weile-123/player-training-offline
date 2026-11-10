import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { leaderboard, type Ranking } from '../platform/leaderboard';
import { money } from './ContractPanels';
import { useContract } from '../contractStore';
import { nbaTemplates, templateById } from '../game/templates';
import { overallRating } from '../game/matching';
import {getHupuUser} from '../platform/hupuAccount';
import {ComicDialog} from './ComicDialog';

export function ContractLeaderboard() {
    const [tab, setTab] = useState(0), [refresh, setRefresh] = useState(0), [data, setData] = useState<Ranking | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
    const id = useId(), buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const mock = useContract(s => import.meta.env.DEV && s.debug.mockLeaderboard);
    const unassigned=useSyncExternalStore(leaderboard.subscribe,leaderboard.getUnassignedCount,leaderboard.getUnassignedCount);
    const [claimUser,setClaimUser]=useState<{puid:string;nickname:string}|null>(null),[claimBusy,setClaimBusy]=useState(false),[claimError,setClaimError]=useState('');
    const submission = useSyncExternalStore(leaderboard.subscribe, leaderboard.getMessage, leaderboard.getMessage);
    useEffect(() => {
        let active = true; setLoading(true); setError(''); setData(null);
        if (mock) {
            const entries = Array.from({length:50}, (_, i) => {
                const template = nbaTemplates[i % nbaTemplates.length];
                const value = String((50-i)*12345678);
                return {id:'preview-'+i,coach:i===7?'我的训练师':'训练师 '+(i+1),score:tab===0?String(80-i):value,best:{playerId:'preview',templateId:template.id,value,level:99-i,stats:template.stats}};
            });
            setData({entries,me:{rank:8,entry:entries[7]}});setLoading(false);
            return () => { active=false; };
        }
        let request=0;
        const read=()=>{const version=++request;return leaderboard.list(tab===0?'endless':'player',value=>{if(active&&version===request){setData(value);setError('');setLoading(false);}}).then(value=>{if(active&&version===request){setData(value);setError('');}}).catch(e=>{if(active&&version===request)setError(e instanceof Error?e.message:'排行榜加载失败');}).finally(()=>{if(active&&version===request)setLoading(false);});};
        void read();
        // Uploads (including rate-limit waits) never hold the public list spinner.
        void leaderboard.retry().then(submitted=>{if(active&&submitted)void read();});
        return () => { active = false; };
    }, [tab, refresh, mock]);
    return <div className="leaderboard">
        <div className="leaderboard-tabs" data-index={tab} role="tablist" aria-label="排行榜分类">{['无尽排行', '球员排行'].map((label, i) => <button key={label} ref={el => { buttons.current[i] = el; }} id={id + '-tab-' + i} role="tab" aria-selected={tab === i} aria-controls={id + '-panel'} tabIndex={tab === i ? 0 : -1} onClick={() => setTab(i)} onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - i; setTab(next); buttons.current[next]?.focus(); }}>{label}</button>)}</div>
        <div className={'leaderboard-personal online-personal ' + (tab === 1 ? 'is-player' : '')} aria-busy={loading}>
            {data?.me && !loading ? <>
                <div className="personal-coach"><span className="personal-place">第 {data.me.rank} 名</span><strong>{data.me.entry.coach}</strong><small>我的排名</small></div>
                {tab === 1 && <div className="personal-player"><strong>{templateById(data.me.entry.best?.templateId)?.name ?? '球员'}</strong>{data.me.entry.best && <div className="personal-tags"><span>训练 +{data.me.entry.best.level}</span><span>综评 {overallRating(data.me.entry.best.stats).toFixed(1)}</span></div>}</div>}
                <b className="personal-score">{tab === 0 ? '第 ' + data.me.entry.score + ' 月' : money(data.me.entry.score)}</b>
            </> : <div><small>我的排名</small><strong>{loading||data?.personalPending ? '加载中…' : error||data?.personalError ? '暂未获取排名' : '暂无排名'}</strong></div>}
        </div>
        <section id={id + '-panel'} role="tabpanel" aria-labelledby={id + '-tab-' + tab} className="leaderboard-page" aria-busy={loading}>
            {loading ? <p role="status">正在读取排行榜…</p> : error ? <p role="alert">{error}</p> : !data?.entries.length ? <p>暂无已提交的成绩</p> : <ol className={'leaderboard-list ' + (tab === 0 ? 'endless-ranking' : 'player-ranking')} tabIndex={0} aria-label="排行榜前50名">{data.entries.map((row, i) => <li key={row.id}>
                <div className="leaderboard-coach"><span className="leaderboard-rank" data-place={i + 1}>{i + 1}</span><strong>{row.coach}</strong></div>
                {tab === 0 ? <b className="leaderboard-month">第 <em>{row.score}</em> 月</b> : <><div className="leaderboard-template"><strong>{templateById(row.best?.templateId ?? '')?.name ?? '球员'}</strong>{row.best && <div><span>训练 +{row.best.level}</span><span>综评 {overallRating(row.best.stats).toFixed(1)}</span></div>}</div><b className="leaderboard-value">{money(row.score)}</b></>}
            </li>)}</ol>}
        </section>
        <button type="button" className="secondary" disabled={loading} onClick={() => setRefresh(n => n + 1)}>刷新排行榜</button>
        {!mock&&unassigned>0&&<button className="secondary" disabled={claimBusy} onClick={()=>{setClaimBusy(true);setClaimError('');void getHupuUser().then(user=>{if(!user?.puid)throw Error('请登录原虎扑账号后确认补传');setClaimUser({puid:user.puid,nickname:user.nickname||'当前虎扑账号'});}).catch(e=>setClaimError(e instanceof Error?e.message:'获取账号失败，请稍后重试')).finally(()=>setClaimBusy(false));}}>{claimBusy?'正在获取账号…':`确认补传 ${unassigned} 局成绩`}</button>}
        {!claimUser&&claimError&&<p role="status" className="leaderboard-note">{claimError}</p>}
        {claimUser&&<ComicDialog title="确认成绩所属账号" onClose={()=>setClaimUser(null)}><p>这些成绩结束时未能确认登录账号，已保存在本机。请确认它们属于「{claimUser.nickname}」后再补传。</p><button className="primary" disabled={claimBusy} onClick={()=>{setClaimBusy(true);setClaimError('');void leaderboard.claim(claimUser.puid).then(()=>{setClaimUser(null);setRefresh(n=>n+1);}).catch(e=>setClaimError(e instanceof Error?e.message:'确认失败，请刷新账号')).finally(()=>setClaimBusy(false));}}>{claimBusy?'正在补传…':'确认属于此账号并补传'}</button><button className="secondary" onClick={()=>setClaimUser(null)}>暂不提交</button>{claimError&&<p role="status">{claimError}</p>}</ComicDialog>}
        {!mock && submission && <p role="status" className="leaderboard-note">{submission}</p>}
        <p className="leaderboard-note">每人保留最佳成绩 · 同分先达到者在前。信用归零后返回首页提交成绩。</p>
    </div>;
}
