import {useState} from 'react';
import {challengeUnlockLevel} from '../game/gym/challenge';
import {toggleGymDebug, useGymDebug} from '../platform/gymDebug';
import {useGym} from '../gymStore';
import {ComicDialog} from './ComicDialog';

export function GymDebugDialog({onClose,onLevelChange}: {onClose:()=>void;onLevelChange?:(openChallenge:boolean)=>void}) {
  const debug=useGymDebug(), store=useGym();
  const [level,setLevel]=useState(store.state.gymLevel), [busy,setBusy]=useState(false), [error,setError]=useState('');

  async function change(targetLevel:number|null, recommendAllTemplates=false) {
    setBusy(true);
    setError('');
    try {
      const {debugRestoreGym,debugSetGymLevel}=useGym.getState();
      const result=targetLevel===null?await debugRestoreGym?.():await debugSetGymLevel?.(targetLevel,{recommendAllTemplates});
      if (!result) throw Error('测试球馆暂不可用');
      if (result.error) throw Error(result.error);
      onLevelChange?.(recommendAllTemplates);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'测试球馆切换失败');
    } finally {
      setBusy(false);
    }
  }

  return <ComicDialog title="本地测试" className="gym-management-dialog" onClose={onClose}>
    <div className="gym-panel gym-debug-content" aria-busy={busy}>
      {([['skipPosting','跳过发帖'],['skipAds','跳过广告']] as const).map(([key,label])=>
        <button key={key} className="gm-button" type="button" aria-pressed={debug[key]} onClick={()=>toggleGymDebug(key)}>
          {label} · {debug[key]?'已开启':'已关闭'}
        </button>
      )}
      <section className="gm-paper gm-stack">
        <h3>球馆挑战</h3>
        <p className="gm-muted">启用跳过后，使用挑战内的广告或发帖按钮会在独立测试球馆继续当前挑战。测试成绩不会上榜。</p>
        <p className="gm-muted">进入 3 级测试球馆，将每种模板推荐一次，用于测试挑战初始等级加成。</p>
        <button type="button" className="gm-button gm-primary" disabled={busy} onClick={()=>void change(challengeUnlockLevel,true)}>推荐全部模板并进入挑战</button>
        <button type="button" className="gm-button" disabled={busy} onClick={()=>void change(challengeUnlockLevel)}>一键升到 3 级</button>
      </section>
      <section className="gm-paper gm-stack">
        <h3>测试球馆等级</h3>
        <p className="gm-muted">切换会新建独立测试球馆，原球馆进度保留。</p>
        <div className="gm-height-options" role="group" aria-label="测试球馆等级" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:6}}>
          {Array.from({length:8},(_,i)=>i+1).map(value=>
            <button type="button" key={value} className="gm-button" aria-pressed={level===value} disabled={busy}
              onClick={()=>setLevel(value)} style={level===value?{background:'#b52d23',color:'#fff2ca'}:undefined}>{value}级</button>
          )}
        </div>
        <button type="button" className="gm-button gm-primary" disabled={busy} onClick={()=>void change(level)}>进入{level}级测试球馆</button>
        {store.debugSessionActive&&<>
          <p role="status">当前为{store.state.gymLevel}级独立测试球馆</p>
          <button type="button" className="gm-button" disabled={busy} onClick={()=>void change(null)}>恢复测试前球馆</button>
        </>}
      </section>
      {error&&<p role="alert">{error}</p>}
    </div>
  </ComicDialog>;
}
