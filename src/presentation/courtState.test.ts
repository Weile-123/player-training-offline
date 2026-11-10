import {it,expect} from 'vitest';
import {newContract} from '../game/contract/engine';
import {courtNextAction} from './courtState';
it('空营只能结束本月；仅剩休息球员进入休息室；待交付球员不算可训练',()=>{
 const [p]=newContract(7).players;
 expect(courtNextAction([],[]).panel).toBe('交付确认');
 expect(courtNextAction([p],[p.id]).panel).toBe('休息室');
 expect(courtNextAction([p],[]).panel).toBe('球员名单');
 expect(courtNextAction([{...p,queued:true}],[]).panel).toBe('交付确认');
});
it('达标且仍有未交付球员时同时提供名单和结束本月，含休息室留存球员',()=>{
 const [p]=newContract(7).players;
 expect(courtNextAction([p],[],true)).toMatchObject({panel:'球员名单',canSettle:true});
 expect(courtNextAction([p],[p.id],true)).toMatchObject({panel:'球员名单',canSettle:true});
 expect(courtNextAction([{...p,queued:true}],[],true).panel).toBe('交付确认');
 expect(courtNextAction([],[],true).panel).toBe('交付确认');
 expect(courtNextAction([p],[],false)).not.toHaveProperty('canSettle');
});
