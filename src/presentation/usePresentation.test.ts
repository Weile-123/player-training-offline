import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {newGame,seededRandom,select} from '../game/engine';
import type {Game} from '../game/types';
import type {usePresentation} from './usePresentation';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.doUnmock('./audio');});
async function fixture(game:Game,unlocks:string[]=[]){
 vi.resetModules();
 const data=new Map<string,string>(),storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
 vi.stubGlobal('window',{localStorage:storage});vi.stubGlobal('localStorage',storage);
 const play=vi.fn().mockResolvedValue(true);
 vi.doMock('./audio',()=>({gameAudio:{play,mute:vi.fn()}}));
 const {useGame}=await import('../store'),{usePresentation}=await import('./usePresentation');
 useGame.setState({game,collection:{},newUnlocks:unlocks});
 let controller!:ReturnType<typeof usePresentation>;
 // Capture the real hook's event handlers without mocking React or game actions.
 function Harness(){controller=usePresentation();return null;}
 renderToStaticMarkup(createElement(Harness));
 const click=()=>controller.train();
 return {useGame,controller,click,play};
}

describe('training presentation integration',()=>{
 it('trains an on-court player even when a previous template unlock is pending',async()=>{
  const original=newGame(seededRandom(4)),game=select(original,original.selectedId!);
  const {useGame,click,play}=await fixture(game,['curry']);
  vi.spyOn(Math,'random').mockReturnValue(.99);
  click();
  expect(useGame.getState().game.totalShots).toBe(game.totalShots+1);
  expect(useGame.getState().game.activePlayer?.shots).toBe(game.activePlayer!.shots+1);
  expect(play).toHaveBeenCalledTimes(1);
 });
 it('continues shooting after a new unlock and after switching the trainee',async()=>{
  const original=newGame(seededRandom(4)),selected=select(original,original.selectedId!);
  const game={...selected,activePlayer:{...selected.activePlayer!,height:190,templateId:null,level:0,stats:{three:44,mid:44,drive:44,inside:44,handle:44,defense:44}}};
  const {useGame,controller,click,play}=await fixture(game);
  vi.spyOn(Math,'random').mockReturnValue(.99);
  click();expect(useGame.getState().newUnlocks.length).toBeGreaterThan(0);
  controller.finish();click();expect(useGame.getState().game.totalShots).toBe(2);
  const nextId=useGame.getState().game.recruits[0].id;
  useGame.getState().select(nextId);controller.clear();click();
  expect(useGame.getState().game.activePlayer?.id).toBe(nextId);
  expect(useGame.getState().game.totalShots).toBe(3);expect(play).toHaveBeenCalledTimes(3);
 });
});
