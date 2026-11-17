import {getGymDebug, toggleGymDebug, useGymDebug} from '../platform/gymDebug';
import {ComicDialog} from './ComicDialog';
export function GymDebugDialog({onClose}: {onClose: () => void}) {
 const debug = useGymDebug();
 return <ComicDialog title="本地测试" className="gym-management-dialog" onClose={onClose}><div className="gym-panel gym-debug-content"><p className="gm-muted">开关自动保存在当前浏览器，刷新后保留。仅本地开发环境生效，游戏奖励限制照常。</p>{([['skipPosting', '跳过发帖'], ['skipAds', '跳过广告']] as const).map(([key, label]) => <button key={key} className="gm-button" type="button" aria-pressed={debug[key]} onClick={() => toggleGymDebug(key)}>{label}：{getGymDebug()[key] ? '已开启' : '已关闭'}</button>)}</div></ComicDialog>;
}
