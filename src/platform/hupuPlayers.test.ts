import {afterEach,describe,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
async function fixture(response:unknown) {
 vi.resetModules();
 const request=vi.fn().mockResolvedValue(response);
 vi.stubGlobal('window',{ColorboxAI:{request:{basketball:{playerInfo:request}}}});
 return {request,api:await import('./hupuPlayers')};
}
describe('Hupu NBA profiles',()=>{
 it('uses the documented SDK, validated identity and returned name/photo, caching concurrent calls',async()=>{
  const {api,request}=await fixture({code:200,data:{player:{playerId:'1901000000470668',name:'亚历克斯-卡鲁索',eng_name:'Alex Caruso',big_photo:'http://i11.hoopchina.com.cn/current.png'}}});
  const profiles=await Promise.all(Array.from({length:10},()=>api.loadPlayerProfile('caruso')));
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith({playerId:'1901000000470668',leagueType:'NBA'});
  expect(profiles[0]).toMatchObject({name:'亚历克斯-卡鲁索',avatar:'https://i11.hoopchina.com.cn/current.png',source:'hupu',message:''});
  await api.loadPlayerProfile('caruso');expect(request).toHaveBeenCalledTimes(1);
 });
 it('does not request an invented player ID for retired/unmapped stars, or undiscovered players',async()=>{
  const {api,request}=await fixture({code:200});
  expect(await api.loadPlayerProfile('jordan')).toMatchObject({source:'remote',avatar:expect.stringContaining('art/')});
  expect(api.fallbackProfile(null)).toBeNull();expect(await api.loadPlayerProfile('unknown')).toBeNull();
  expect(request).not.toHaveBeenCalled();
 });
 it.each([408,429,503])('stops further automatic profile requests after %i and exposes server message',async code=>{
  const {api,request}=await fixture({code,message:'请稍后再试'});
  expect(await api.loadPlayerProfile('caruso')).toMatchObject({message:'请稍后再试',source:'remote'});
  expect(await api.loadPlayerProfile('curry')).toMatchObject({message:'请稍后再试'});
  expect(request).toHaveBeenCalledTimes(1);
 });
 it('reports non-200 messages without dropping the remote fallback',async()=>{
  const {api}=await fixture({code:404,message:'未找到该球员'});
  expect(await api.loadPlayerProfile('caruso')).toMatchObject({message:'未找到该球员',avatar:expect.stringContaining('art/poster-portraits/caruso.png')});
 });
 it('rejects the wrong player and invalid image schemes',async()=>{
  const {api}=await fixture({code:200,data:{player:{playerId:'wrong',name:'另一个人',photo:'https://example.com/a.png'}}});
  expect(await api.loadPlayerProfile('caruso')).toMatchObject({name:'亚历克斯·卡鲁索',source:'remote',message:'球员资料不匹配'});
  for(const url of ['javascript:alert(1)','data:image/png,foo','/local.png',null])expect(api.safeAvatarUrl(url)).toBe('');
  expect(api.safeAvatarUrl('//i11.hoopchina.com.cn/a.png')).toBe('https://i11.hoopchina.com.cn/a.png');
 });
 it('degrades to a usable remote portrait if the SDK cannot load',async()=>{
  vi.resetModules();vi.stubGlobal('window',{});vi.stubGlobal('document',undefined);
  const api=await import('./hupuPlayers');
  expect(await api.loadPlayerProfile('caruso')).toMatchObject({source:'remote',message:'球员资料服务暂不可用'});
 });
});
