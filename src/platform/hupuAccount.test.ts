import {afterEach,describe,expect,it,vi} from 'vitest';
import activity from '../../hupu-skills/activity.json';
const testApplicationId=activity.activityId;
import {cloudSaveKey,downloadCloudSave,feedbackConfig,feedbackLength,getHupuUser,getCloudRateState,submitUserFeedback,uploadCloudSave} from './hupuAccount';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(){
 const auth=vi.fn().mockResolvedValue({code:200,data:{islogin:1,puid:'private-id',nickname:'训练师',avatar:'https://example.com/avatar.png'}});
 const request=vi.fn().mockResolvedValue({statusCode:201,code:0,data:{id:'feedback'}});
 const getValue=vi.fn().mockResolvedValue({code:200,data:null}),setValue=vi.fn().mockResolvedValue({code:200});
 const checkAudit=vi.fn().mockResolvedValue({code:200,data:true});
 vi.stubGlobal('window',{ColorboxAI:{auth:{getUserInfo:auth},security:{checkAudit},cloud:{request},cloudSave:{getValue,setValue}}});
 return {auth,request,getValue,setValue,checkAudit};
}
describe('documented Hupu account and feedback APIs',()=>{
 it('requires a service receipt before confirming feedback success',async()=>{
  const {request}=fixture();
  expect(await submitUserFeedback('建议')).toEqual({id:'feedback'});
  request.mockResolvedValueOnce({statusCode:201,code:0,data:{id:123}});
  expect(await submitUserFeedback('建议')).toEqual({id:'123'});
  for(const data of [undefined,null,{}, {id:''},{id:' '},{id:false}]){
   request.mockResolvedValueOnce({statusCode:201,code:0,data});
   await expect(submitUserFeedback('建议')).rejects.toThrow('未收到反馈编号');
  }
 });
 it.each([{code:200,data:false},{code:401},{code:500},{code:200,data:null}])('never submits feedback when content detection does not pass (%j)',async audit=>{
  const {checkAudit,request}=fixture();checkAudit.mockResolvedValue(audit);
  await expect(submitUserFeedback(' 测试反馈 ')).rejects.toThrow();
  expect(checkAudit).toHaveBeenCalledExactlyOnceWith('测试反馈');expect(request).not.toHaveBeenCalled();
 });
 it('keeps feedback local when content detection fails or is unavailable',async()=>{
  const {checkAudit,request}=fixture();checkAudit.mockRejectedValue(Error('network'));
  await expect(submitUserFeedback('建议')).rejects.toThrow('内容检测暂不可用');
  delete window.ColorboxAI!.security;
  await expect(submitUserFeedback('建议')).rejects.toThrow('内容检测暂不可用');expect(request).not.toHaveBeenCalled();
 });
 it('handles guests and surfaces account API errors',async()=>{
  const {auth}=fixture();auth.mockResolvedValueOnce({code:200,data:null});expect(await getHupuUser()).toBeNull();
  auth.mockResolvedValueOnce({code:403,message:'请先登录虎扑'});await expect(getHupuUser()).rejects.toThrow('请先登录虎扑');
 });
 it('uses fixed activity configuration, SDK auth and only permitted feedback fields',async()=>{
  const {request,auth}=fixture();await submitUserFeedback('  很好用 🏀  ');
 expect(auth).toHaveBeenCalledTimes(1);expect(request).toHaveBeenCalledExactlyOnceWith({url:feedbackConfig.apiBase+'/feedback',method:'POST',envId:feedbackConfig.envId,auth:true,data:{applicationId:testApplicationId,content:'很好用 🏀',nickname:'训练师',avatarUrl:'https://example.com/avatar.png'}});
 });
 it('uses Unicode code points and rejects empty or 2001-character input before any request',async()=>{
  const {request,auth}=fixture();expect(feedbackLength(' 🏀 ')).toBe(1);
  for(const value of ['  ','🏀'.repeat(2001)])await expect(submitUserFeedback(value)).rejects.toThrow('1–2000');
  expect(auth).not.toHaveBeenCalled();await submitUserFeedback('🏀'.repeat(2000));expect(request).toHaveBeenCalledTimes(1);
 });
 it('does not submit for guests and never accepts user-supplied identity',async()=>{
  const {auth,request}=fixture();auth.mockResolvedValueOnce({code:200,data:{islogin:0}});
  await expect(submitUserFeedback('建议')).rejects.toThrow('请先在虎扑登录');expect(request).not.toHaveBeenCalled();
  auth.mockResolvedValueOnce({code:200,data:{islogin:1,avatar:'http://example.com/photo'}});await submitUserFeedback('建议');
  expect(request.mock.calls[0][0].data).toEqual({applicationId:feedbackConfig.applicationId,content:'建议'});
 });
 it.each([[400,'不符合要求'],[401,'重新登录'],[413,'过长'],[429,'过于频繁'],[500,'暂不确定'],[200,'暂不确定']])('handles HTTP %i without retries',async(statusCode,message)=>{
  const {request}=fixture();request.mockResolvedValue({statusCode,code:0,message:'internal details'});
  await expect(submitUserFeedback('建议')).rejects.toThrow(String(message));expect(request).toHaveBeenCalledTimes(1);
 });
 it('does not retry a network failure or claim success for malformed 201 responses',async()=>{
  const {request}=fixture();request.mockRejectedValueOnce(Error('private transport detail'));
  await expect(submitUserFeedback('建议')).rejects.toThrow('暂不确定');expect(request).toHaveBeenCalledTimes(1);
  request.mockResolvedValueOnce({statusCode:201,code:1});await expect(submitUserFeedback('建议')).rejects.toThrow('暂不确定');
 });
 it('times out feedback without an automatic second submission',async()=>{
  vi.useFakeTimers();const {request}=fixture();request.mockImplementation(()=>new Promise(()=>{}));
  const result=expect(submitUserFeedback('建议')).rejects.toThrow('暂不确定');await vi.advanceTimersByTimeAsync(20001);await result;expect(request).toHaveBeenCalledTimes(1);
 });
});
describe('Hupu cloud save transport',()=>{
 it('exposes shared cooldown deadlines and refuses reads and writes after an account switch',async()=>{
  vi.useFakeTimers();const {auth,getValue,setValue}=fixture();
  await uploadCloudSave('first','private-id');expect(getCloudRateState()).toEqual({readUntil:0,writeUntil:Date.now()+3000});
  await downloadCloudSave('private-id');expect(getCloudRateState().readUntil).toBe(Date.now()+3000);
  auth.mockResolvedValue({code:200,data:{islogin:1,puid:'different'}});await vi.advanceTimersByTimeAsync(3000);
  await expect(uploadCloudSave('second','private-id')).rejects.toThrow('账号已切换');
  await expect(downloadCloudSave('private-id')).rejects.toThrow('账号已切换');
  expect(setValue).toHaveBeenCalledTimes(1);expect(getValue).toHaveBeenCalledTimes(1);
 });
 it('spaces reads and writes independently by 3 seconds, with no queued retries',async()=>{
  vi.useFakeTimers();const {getValue,setValue}=fixture();
  await downloadCloudSave();await uploadCloudSave('first');
  await expect(downloadCloudSave()).rejects.toThrow('3 秒');
  await expect(uploadCloudSave('second')).rejects.toThrow('3 秒');
  await vi.advanceTimersByTimeAsync(2999);await expect(downloadCloudSave()).rejects.toThrow('1 秒');
  expect(getValue).toHaveBeenCalledTimes(1);expect(setValue).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);await downloadCloudSave();await uploadCloudSave('second');
  expect(getValue).toHaveBeenCalledTimes(2);expect(setValue).toHaveBeenCalledTimes(2);
 });
 it('keeps failed calls in the cooldown and rejects a second in-flight operation',async()=>{
  vi.useFakeTimers();const {getValue}=fixture();
  getValue.mockResolvedValueOnce({code:429,message:'请稍后重试'});
  await expect(downloadCloudSave()).rejects.toThrow('请稍后重试');
  await expect(downloadCloudSave()).rejects.toThrow('3 秒');
  await vi.advanceTimersByTimeAsync(3000);
  let complete!:(value:unknown)=>void;getValue.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  const pending=downloadCloudSave();await vi.advanceTimersByTimeAsync(3001);
  await expect(downloadCloudSave()).rejects.toThrow('正在处理中');
  complete({code:200,data:null});await pending;expect(getValue).toHaveBeenCalledTimes(2);
 });
 it('uses cloudSave rather than old storage, and treats null as an empty slot',async()=>{
  const {setValue,getValue}=fixture();expect(await downloadCloudSave()).toBeNull();
  await uploadCloudSave('存档');expect(setValue).toHaveBeenCalledExactlyOnceWith({key:cloudSaveKey,value:'存档'});
  expect(getValue).toHaveBeenCalledExactlyOnceWith({key:cloudSaveKey});
 });
 it('measures the 2 MB limit in UTF-8 bytes and checks errors',async()=>{
  const {setValue,getValue}=fixture();await expect(uploadCloudSave('中'.repeat(700000))).rejects.toThrow('2 MB');expect(setValue).not.toHaveBeenCalled();
  setValue.mockResolvedValueOnce({code:401,message:'请重新登录'});await expect(uploadCloudSave('{}')).rejects.toThrow('请重新登录');
  getValue.mockResolvedValueOnce({code:500,message:'服务暂不可用'});await expect(downloadCloudSave()).rejects.toThrow('服务暂不可用');
 });
});
