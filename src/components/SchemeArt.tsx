import {assetUrl} from '../presentation/assetUrls';
/** 方案 A 原图作为图集：SVG 视口直接显示指定区域，不重新生成头像。 */
const atlas = ()=>assetUrl('art/scheme-a/design-atlas.png');
const regions = {
 rookie: '62 922 233 255', drink: '73 189 52 102', brace: '246 191 63 100',
 timer: '397 189 80 103', chalk: '551 201 82 80',
} as const;
export function SchemeArt({name,className='',label}:{name:keyof typeof regions;className?:string;label?:string}) {
 return <svg className={`scheme-art ${className}`} viewBox={regions[name]} preserveAspectRatio="xMidYMid slice" role={label?'img':undefined} aria-label={label} aria-hidden={label?undefined:true}><image href={atlas()} width="1024" height="1536"/></svg>;
}
