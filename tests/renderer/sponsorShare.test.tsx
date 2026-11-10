import {it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {ContractShop} from '../../src/components/CommercePanels';
import {useContract} from '../../src/contractStore';
it('shares through both entrances, hides both after claiming, and restores them three months later',async()=>{
 vi.useFakeTimers();useContract.getState().start();
 const state=useContract.getState().state;state.commerce.shop.giftAvailable=false;
 useContract.setState({state,debug:{...useContract.getState().debug,mockPosterShare:true}});
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<ContractShop/>));
  await act(async()=>document.querySelector<HTMLButtonElement>('.coupon-help-button')!.click());
  expect(document.querySelectorAll('.sponsor-share-button')).toHaveLength(2);
  await act(async()=>document.querySelector<HTMLButtonElement>('.coupon-method .sponsor-share-button')!.click());
  expect([...document.querySelectorAll('button.sponsor-share-button')].every(b=>(b as HTMLButtonElement).disabled)).toBe(true);
  await act(async()=>vi.advanceTimersByTimeAsync(1000));
  expect(useContract.getState().state.credits).toBe(state.credits+1);
  expect(document.querySelectorAll('.sponsor-share-button')).toHaveLength(0);
  const claimed=useContract.getState().state;
  await act(async()=>useContract.setState({state:{...claimed,month:claimed.month+2}}));
  expect(document.querySelectorAll('.sponsor-share-button')).toHaveLength(0);
  await act(async()=>useContract.setState({state:{...claimed,month:claimed.month+3}}));
  expect(document.querySelectorAll('.sponsor-share-button')).toHaveLength(2);
 }finally{act(()=>root.unmount());vi.useRealTimers();}
});
