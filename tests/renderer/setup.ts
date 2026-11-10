import {readFileSync} from 'node:fs';
import {beforeEach,vi} from 'vitest';
beforeEach(()=>{
 // jsdom has no media decoder. Playback/codec fallback is tested with a controlled
 // media implementation in sampleAudio.test.ts and the browser smoke page.
 HTMLMediaElement.prototype.play=vi.fn(async()=>{});
 HTMLMediaElement.prototype.pause=vi.fn();
 const html=readFileSync('index.html','utf8');
 // Only the checked-in, static prototype bank; never application or user data.
 document.body.innerHTML=html.match(/<template id="game-svg-prototypes">[\s\S]*?<\/template>/)![0]+'<div id="root"></div>';
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>setTimeout(()=>cb(performance.now()),0));
 vi.stubGlobal('cancelAnimationFrame',clearTimeout);
});
