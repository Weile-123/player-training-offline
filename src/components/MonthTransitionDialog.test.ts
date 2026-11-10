import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {MonthTransitionDialog} from './MonthTransitionDialog';

it('announces the final month once and keeps rolling digits hidden from screen readers',()=>{
 const html=renderToStaticMarkup(createElement(MonthTransitionDialog,{change:{from:9,to:10},reduced:false,onComplete:()=>{}}));
 expect(html).toContain('第9月已结算，进入第10月');expect(html).toContain('aria-live="polite"');
 expect(html.match(/month-transition-digit is-moving/g)).toHaveLength(2);
 expect(html).not.toContain('<button');
});
it('shows the target digits directly when reduced motion is enabled',()=>{
 const html=renderToStaticMarkup(createElement(MonthTransitionDialog,{change:{from:99,to:100},reduced:true,onComplete:()=>{}}));
 expect(html).not.toContain('is-moving');expect(html).toContain('is-reduced');
 expect(html.match(/class="month-transition-digit"/g)).toHaveLength(3);
});
