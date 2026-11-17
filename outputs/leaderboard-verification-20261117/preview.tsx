import {createRoot} from 'react-dom/client';
import {GymLeaderboard} from '../../src/components/GymLeaderboard';
import {ComicDialog} from '../../src/components/ComicDialog';
import {gymLeaderboard} from '../../src/platform/gymLeaderboard';
import {nbaTemplates} from '../../src/game/templates';
import '../../src/fonts/fonts.css';
import '../../src/styles.css';
import '../../src/home.css';
import '../../src/gameplay.css';
import '../../src/components/ComicDialog.css';
import '../../src/contract.css';
import '../../src/scheme-a.css';
import '../../src/commerce.css';
import '../../src/collection-album.css';
import '../../src/career-dialogs.css';
import '../../src/leaderboard.css';
import '../../src/career-collection.css';
import '../../src/player-tiers.css';
import '../../src/fonts/typography.css';
// Test-only data; this page is not imported by the production entry.
gymLeaderboard.list=async board=>{
 const entries=Array.from({length:50},(_,index)=>{
  const template=nbaTemplates[index % nbaTemplates.length], value=String((50-index)*12345678);
  return {id:`demo-${index}`,coach:index===7?'我的球馆教练':`球馆教练 ${index+1}`,score:board==='fame'?String(18500-index*230):value,best:board==='fame'?null:{playerId:'demo-player',templateId:template.id,value,level:99-index,stats:template.stats}};
 });
 return {entries,me:{rank:8,entry:entries[7]}};
};
createRoot(document.getElementById('root')!).render(<><aside className="verification-note">本地样式验收 · 演示数据</aside><ComicDialog title="排行榜" variant="album" className="leaderboard-dialog" onClose={()=>{}}><div className="contract-panel"><GymLeaderboard/></div></ComicDialog><style>{`html,body,#root{margin:0;width:100%;height:100%;background:#091d28}.verification-note{position:fixed;z-index:999;top:0;left:0;color:#f5d490;background:#112d3b;padding:3px 8px;font:11px sans-serif}`}</style></>);
