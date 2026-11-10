import {afterEach,expect,it,vi} from 'vitest';
const testPostingTarget=vi.hoisted(()=>({topicId:'topic-test',tagId:'tag-test',topicName:'测试专区',tagName:'测试话题'}));
vi.mock('../data/poster-posting.json',()=>({default:testPostingTarget}));
vi.mock('./hupuAccount',()=>({getHupuUser:async()=>({puid:'1'})}));
vi.mock('../presentation/sponsorPoster',async importOriginal=>({...await importOriginal(),createSponsorPoster:async()=>new Blob(['png'],{type:'image/png'})}));
import {openSponsorPost} from './sponsorPosting';
afterEach(()=>vi.unstubAllGlobals());
it('stops before opening the editor if upload fails or returns an unsafe URL',async()=>{
 const open=vi.fn(),upload=vi.fn().mockRejectedValueOnce(Error('上传失败')).mockResolvedValueOnce({downloadUrl:'http://example.com/image.png'});
 vi.stubGlobal('window',{ColorboxAI:{oss:{uploadFile:upload},request:{bbs:{openPostEditor:open}}}});
 const data={month:10,delivered:'1000',totalShots:100};
 await expect(openSponsorPost(data)).rejects.toThrow('上传失败');
 await expect(openSponsorPost(data)).rejects.toThrow('地址无效');expect(open).not.toHaveBeenCalled();
});
it('opens the editor with game copy and configured topic, without reward language',async()=>{
 const open=vi.fn().mockResolvedValue({code:200});
 vi.stubGlobal('window',{ColorboxAI:{oss:{uploadFile:async()=>({downloadUrl:'https://example.com/poster.png'})},request:{bbs:{openPostEditor:open}},bbsConfig:{get:async()=>({bbsTagId:'tag',bbsTopicId:'topic'})}}});
 await openSponsorPost({month:4,delivered:'12000',totalShots:56});const params=open.mock.calls[0][0];
 expect(params.content).toContain('第 4 月');expect(params.content).not.toMatch(/赞助券|奖励/);expect(params).toMatchObject(testPostingTarget);expect(params.imageUrl).toBe('https://example.com/poster.png');expect(params.content).toContain('56');expect(params.content).toContain('$1.20万');
});
it.each(['absent','empty','different','throws'])('always supplies the game destination when platform config is %s',async mode=>{
 const open=vi.fn().mockResolvedValue({code:200});
 const config=vi.fn(()=>{if(mode==='throws')throw Error('unavailable');return Promise.resolve(mode==='empty'?null:{bbsTopicId:'85',bbsTagId:'other'});});
 vi.stubGlobal('window',{ColorboxAI:{oss:{uploadFile:async()=>({downloadUrl:'https://example.com/poster.png'})},request:{bbs:{openPostEditor:open}},...(mode==='absent'?{}:{bbsConfig:{get:config}})}});
 await openSponsorPost({month:5,delivered:'12000',totalShots:60});
 expect(open).toHaveBeenCalledOnce();
 expect(open.mock.calls[0][0]).toMatchObject({...testPostingTarget,imageUrl:'https://example.com/poster.png'});
 expect(config).not.toHaveBeenCalled();
});
it('propagates cancellation and errors without automatic retries',async()=>{
 const open=vi.fn().mockResolvedValue({code:499,message:'已取消'});
 vi.stubGlobal('window',{ColorboxAI:{oss:{uploadFile:async()=>({downloadUrl:'https://example.com/poster.png'})},request:{bbs:{openPostEditor:open}}}});
 await expect(openSponsorPost({month:1,delivered:'0',totalShots:0})).rejects.toThrow('已取消');expect(open).toHaveBeenCalledOnce();
});
