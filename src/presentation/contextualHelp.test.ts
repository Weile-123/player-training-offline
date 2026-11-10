import {it,expect} from 'vitest';
import {newContract} from '../game/contract/engine';
import {contextualHelp} from './contextualHelp';
it('introduces features in context and remembers acknowledged topics',()=>{
 const g=newContract(7),p=g.players[0];expect(contextualHelp(g,p,null,[])).toBeNull();
 expect(contextualHelp(g,p,'交付确认',[])).toBe('shortfall');expect(contextualHelp(g,p,'球员名单',[])).toBe('signing');
 expect(contextualHelp(g,p,'器材商店',[])).toBe('shop');expect(contextualHelp(g,p,'外部球探',[])).toBe('scout');
 p.heat=10;expect(contextualHelp(g,p,null,[])).toBe('heat');expect(contextualHelp(g,p,null,['heat'])).toBeNull();
 p.templateId='tucker';expect(contextualHelp(g,p,null,['heat'])).toBe('template');
});
