import {it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {ContractLeaderboard} from '../../src/components/ContractLeaderboard';
import {leaderboard} from '../../src/platform/leaderboard';
import {useContract} from '../../src/contractStore';
it('shows public rankings while background retry and personal lookup are pending',async()=>{
 useContract.setState({debug:{...useContract.getState().debug,mockLeaderboard:false}});
 let finishRead!:(value:Awaited<ReturnType<typeof leaderboard.list>>)=>void;
 vi.spyOn(leaderboard,'retry').mockReturnValue(new Promise(()=>{}));
 vi.spyOn(leaderboard,'list').mockImplementation(async(_,onPublic)=>{
  onPublic?.({entries:[{id:'one',coach:'排行榜玩家',score:'20',best:null}],me:null,personalPending:true});
  return new Promise(resolve=>{finishRead=resolve;});
 });
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<ContractLeaderboard/>));
  expect(document.querySelector('.leaderboard-list')?.textContent).toContain('排行榜玩家');
  expect(document.querySelector('.leaderboard-personal')?.textContent).toContain('加载中');
  await act(async()=>finishRead({entries:[{id:'one',coach:'排行榜玩家',score:'20',best:null}],me:null,personalError:'offline'}));
  expect(document.querySelector('.leaderboard-list')?.textContent).toContain('排行榜玩家');
  await vi.waitFor(async()=>{await act(async()=>{await Promise.resolve();});expect(document.querySelector('.leaderboard-personal')?.textContent).toContain('暂未获取排名');});
 }finally{act(()=>root.unmount());vi.restoreAllMocks();}
});
