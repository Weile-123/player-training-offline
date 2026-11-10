import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,expect,it,vi} from 'vitest';
import {HomeSettings,SaveProgress} from './HomeSettings';
import {cloudSync} from '../platform/cloudSync';

afterEach(()=>vi.restoreAllMocks());
it('renders the real Hupu identity, accessible two-line tutorial switch and shared cooldown labels',()=>{
 const snapshot=cloudSync.getSnapshot();
 vi.spyOn(cloudSync,'getSnapshot').mockReturnValue({...snapshot,phase:'ready',user:{islogin:1,puid:'private',nickname:'虎扑教练甲',avatar:'https://i1.hoopchina.com.cn/head.png'},readUntil:Date.now()+2800,writeUntil:Date.now()+1800});
 const html=renderToStaticMarkup(createElement(HomeSettings,{onClose:()=>{}}));
 expect(html).toContain('虎扑教练甲');expect(html).toContain('src="https://i1.hoopchina.com.cn/head.png"');expect(html).toContain('referrerPolicy="no-referrer"');
 expect(html).toContain('role="switch"');expect(html).toContain('开启新生涯时是否进入教程');expect(html).not.toContain('type="radio"');
 expect(html).toContain('上传（2s）');expect(html).toContain('同步（3s）');expect(html).toContain('本地进度');expect(html).toContain('云端进度');
 expect(html).not.toContain('保存当前生涯、球星图鉴');
});
it('renders comparable month, training and update information, with clear unread and empty states',()=>{
 const now=Date.now();
 const local=renderToStaticMarkup(createElement(SaveProgress,{label:'本地进度',month:25,shots:2301,updatedAt:now}));
 const remote=renderToStaticMarkup(createElement(SaveProgress,{label:'云端进度',cloud:{month:24,shots:2200,updatedAt:now-1000,uploadedAt:now}}));
 expect(local).toContain('第 25 月 · 2301 次训练');expect(local).toContain('上次更新');expect(local).not.toContain('时间未记录');
 expect(remote).toContain('第 24 月 · 2200 次训练');expect(remote).toContain('上次上传');
 expect(renderToStaticMarkup(createElement(SaveProgress,{label:'云端进度',known:false}))).toContain('尚未读取');
 expect(renderToStaticMarkup(createElement(SaveProgress,{label:'云端进度',cloud:null}))).toContain('暂无云存档');
});
