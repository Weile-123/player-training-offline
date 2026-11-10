import {useState} from 'react';
import {useContract,type DebugAction} from '../contractStore';
import {itemIds} from '../game/contract/commerce';
import {itemCatalog} from '../game/contract/catalog';
import {money} from '../presentation/money';
import './DevConsole.css';

export default function DevConsole(){
 const store=useContract(),[message,setMessage]=useState('');
 const resourcesDisabled=!store.hasSave||store.state.status!=='playing';
 const act=(action:DebugAction,text:string)=>{store.debugAct(action);setMessage(text);};
 return <div className="dev-console">
  <p className="dev-console-note">本地测试 · 开关自动保存，刷新后保持；资源与跳关保存到当前生涯。</p>{resourcesDisabled&&<p className="dev-console-note">进入正式生涯后可增加资源；图鉴与概率开关现在即可设置。</p>}
  <div className="dev-console-row"><div><strong>排行榜模拟数据</strong><small>仅预览两榜样式，不上传或修改生涯数据</small></div><button type="button" aria-pressed={store.debug.mockLeaderboard} onClick={()=>act('mock-leaderboard','已切换排行榜预览')}>{store.debug.mockLeaderboard?'关闭':'开启'}</button></div>
  <div className="dev-console-row"><div><strong>图鉴一键全满</strong><small>球星与器械；取消后显示真实收藏</small></div><button type="button" aria-pressed={store.debug.fullCollection} onClick={()=>act('collection',store.debug.fullCollection?'已恢复真实收藏':'已点亮全部球星与器械图鉴')}>{store.debug.fullCollection?'取消全满':'一键全满'}</button></div>
  <div className="dev-console-row"><div><strong>重伤概率变 0</strong><small>概率条与实际投篮同时生效</small></div><button type="button" aria-pressed={store.debug.noSevere} onClick={()=>act('no-severe',store.debug.noSevere?'已恢复正常重伤概率':'重伤概率已设为 0')}>{store.debug.noSevere?'关闭':'启动'}</button></div>
  <div className="dev-console-row"><div><strong>传说商店概率</strong><small>开启：普通20% / 稀有30% / 传说50%；下次刷新生效，仍受开放与解锁条件限制</small></div><button type="button" aria-pressed={store.debug.legendaryShop} onClick={()=>act('legendary-shop',store.debug.legendaryShop?'已恢复月份对应概率':'已开启20% / 30% / 50%概率，下次刷新生效')}>{store.debug.legendaryShop?'关闭':'开启'}</button></div>
  <div className="dev-console-row"><div><strong>免发帖测试领奖</strong><small>点击海报的发帖分享即可测试奖励；跳过上传与虎扑编辑器，每名球员仍限一次，仅本地开发有效</small></div><button type="button" aria-pressed={store.debug.mockPosterShare} onClick={()=>act('mock-poster-share',store.debug.mockPosterShare?'已恢复真实发帖流程':'已开启本地模拟领奖')}>{store.debug.mockPosterShare?'关闭':'开启'}</button></div>
  <div className="dev-console-row"><div><strong>免看广告测试</strong><small>点击广告入口直接领奖；次数限制仍生效，仅本地开发有效</small></div><button type="button" aria-pressed={store.debug.mockRewardedAds} onClick={()=>act('mock-rewarded-ads',store.debug.mockRewardedAds?'已恢复真实广告':'已开启免广告测试')}>{store.debug.mockRewardedAds?'关闭':'开启'}</button></div>
  <div className="dev-console-row"><div><strong>跳到第20关</strong><small>直接进入第20月，保留球员、器械与资源</small></div><button type="button" disabled={resourcesDisabled} onClick={()=>act('month-20','已跳至第20月')}>一键跳关</button></div>
  <div className="dev-console-row"><div><strong>经营经费</strong><small>{money(store.state.cash)}</small></div><button type="button" disabled={resourcesDisabled} onClick={()=>act('cash','经营经费 +9,999')}>+9,999</button></div>
  <div className="dev-console-row"><div><strong>赞助券</strong><small>持有 {store.state.credits} 张</small></div><button type="button" disabled={resourcesDisabled} onClick={()=>act('credits','赞助券 +10')}>+10</button></div>
  <div className="dev-console-row"><div><strong>全部一次性物品</strong><small>5 种背包物品各增加 3 个</small></div><button type="button" disabled={resourcesDisabled} onClick={()=>act('items','全部一次性物品各 +3')}>全部 +3</button></div>
  <div className="dev-console-inventory">{itemIds.map(id=><span key={id}>{itemCatalog.find(item=>item.id===id)?.name??id}<b>×{store.state.commerce.inventory[id]}</b></span>)}</div>
  <p className="dev-console-feedback" role="status">{message||'选择上方功能进行测试'}</p>
 </div>;
}
