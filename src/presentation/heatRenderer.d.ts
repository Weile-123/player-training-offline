export type HeatVisual={level:number;time:number;reduced:boolean;images:{board:HTMLImageElement|null;ball:HTMLImageElement|null}|null};
export function stepHeat(level:number,active:boolean,delta:number,reduced?:boolean):number;
export function drawHeatCourt(ctx:CanvasRenderingContext2D,view:ReturnType<typeof import('./shotRenderer.js').sceneProjection>,heat:HeatVisual|null,hoopScale:number):void;
export function drawHeatBall(ctx:CanvasRenderingContext2D,heat:HeatVisual|null,radius:number):void;
