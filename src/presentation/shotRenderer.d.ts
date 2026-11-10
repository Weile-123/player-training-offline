import type { Outcome } from '../game/types';
export type ShotFrame = {
 endMs:number;x:number;y:number;radius:number;alpha:number;occluded:boolean;rotation:number;netHeight:number;netGreen:number;
 camera:{x:number;y:number;angle:number;zoom:number};vignette:number;
 strokes:{points:number[][];color:string;width:number;alpha:number}[];
 label:null|{text:string;color:string;alpha:number};particles:null;
};
export type ShotTimeline={width:number;height:number;fps:number;durationMs:number;outcomes:Record<Outcome,{title:string;color:string;frames:ShotFrame[]}>};
export type ShotImages=Record<'court'|'ball'|'net'|'rim',HTMLImageElement>;
export function frameIndex(frames:ShotFrame[],timeMs:number):number;
export function drawScene(ctx:CanvasRenderingContext2D,images:ShotImages,frame:ShotFrame,ballScale:number,width?:number,height?:number,hoopScale?:number):void;
export function drawMultiScene(ctx:CanvasRenderingContext2D,images:ShotImages,frames:ShotFrame[],ballScale:number,width?:number,height?:number,hoopScale?:number,heat?:import('./heatRenderer.js').HeatVisual|null):void;
export function sceneProjection(width:number,height:number,hoopScale?:number):{scale:number;width:number;height:number;extraX:number;extraY:number;x:(value:number)=>number;y:(value:number)=>number};
