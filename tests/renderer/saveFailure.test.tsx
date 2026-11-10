import {it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import ContractHome from '../../src/components/ContractHome';
import {useContract} from '../../src/contractStore';

it('starts a real career from the homepage with all storage writes rejected',async()=>{
 localStorage.setItem('player-training.tutorial-enabled.v1','false');
 useContract.setState({hasSave:false});
 const blocked=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<ContractHome/>));
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="开始新生涯"]')!.click());
  expect(document.querySelector('[aria-label="球员交付制训练营"]')).toBeTruthy();
  expect(document.body.textContent).not.toContain('新生涯尚未创建');
  const gift=document.querySelector<HTMLButtonElement>('.first-gift-option');expect(gift).toBeTruthy();
  await act(async()=>gift!.click());
  expect(document.querySelector('.first-gift-dialog')).toBeNull();
  expect(useContract.getState().hasSave).toBe(true);
  await act(async()=>document.querySelector<HTMLButtonElement>('.dock-bag')!.click());
  await act(async()=>document.querySelector<HTMLButtonElement>('.inventory-home-button')!.click());
  expect(document.querySelector('[aria-label="王牌训练师首页"]')).toBeTruthy();
  await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="继续游戏"]')!.click());
  expect(document.querySelector('[aria-label="球员交付制训练营"]')).toBeTruthy();
 }finally{act(()=>root.unmount());blocked.mockRestore();}
});
it('tutorial completion enters the real career even when storage is denied',async()=>{
 localStorage.setItem('player-training.tutorial-enabled.v1','true');
 useContract.setState({hasSave:false});
 const blocked=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Denied','SecurityError');});
 const root=createRoot(document.getElementById('root')!);
 const press=async(selector:string)=>{const button=document.querySelector<HTMLButtonElement>(selector);expect(button,selector).toBeTruthy();await act(async()=>button!.click());};
 try{
  await act(async()=>root.render(<ContractHome/>));
  await press('[aria-label="开始新生涯"]');await press('.tutorial-intro-start');
  await press('.tutorial-skip');await press('.tutorial-confirm-skip');
  expect(document.querySelector('[aria-label="球员交付制训练营"]')?.hasAttribute('data-tutorial-step')).toBe(false);
  expect(document.querySelector('.first-gift-dialog')).toBeTruthy();
  expect(document.body.textContent).not.toContain('新生涯尚未创建');expect(useContract.getState().hasSave).toBe(true);
 }finally{act(()=>root.unmount());blocked.mockRestore();}
});
