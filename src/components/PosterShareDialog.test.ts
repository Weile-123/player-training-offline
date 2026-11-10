import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {PosterShareDialog} from './PosterShareDialog';
import {careerPosterData,playerPosterData,type PosterSpec} from '../presentation/completionPoster';
import {newContract} from '../game/contract/engine';

it('all four poster dialogs use the game dialog, a header close and one footer action',()=>{
 const game=newContract(21),player=playerPosterData(game,game.players[0]),record=careerPosterData(game);
 const specs:PosterSpec[]=[{kind:'player',player},{kind:'cap',player},{kind:'career-end',record},{kind:'completion',record}];
 for(const spec of specs){
  const html=renderToStaticMarkup(createElement(PosterShareDialog,{spec,onClose:()=>{},rewardText:spec.kind==='player'?'首次分享可免费升一级，每名球员限一次':undefined}));
  expect(html).toContain('comic-dialog');expect(html).toContain('class="sheet-close"');expect(html).toContain('class="poster-share-footer"');
  expect(html.match(/<button\b/g)).toHaveLength(2);expect(html).not.toContain('plain-dialog');
  for(const removed of ['保存海报','复制文案','重新生成','我在《王牌训练师》培养出','发布前仍可编辑或取消'])expect(html).not.toContain(removed);
  if(spec.kind==='player')expect(html).toContain('首次分享可免费升一级，每名球员限一次');
 }
});
