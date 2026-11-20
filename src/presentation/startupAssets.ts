export const portraitHomeBackground='art/home/background-b-portrait.webp';
export const landscapeHomeBackground='art/home/background-b-landscape.webp';
const homeBackgrounds=[portraitHomeBackground,landscapeHomeBackground] as const;

export function otherHomeBackground(path:string) {
 if(path===portraitHomeBackground)return landscapeHomeBackground;
 if(path===landscapeHomeBackground)return portraitHomeBackground;
}

/** Keep the visible cover, court, ready-to-train portrait, and HUD on the boot path.
 * Gallery, roster portraits and equipment artwork load from their existing URLs on use.
 */
export function selectStartupAssets<T extends {path:string}>(entries:readonly T[]):T[]{
 const preferred=typeof matchMedia==='function'&&matchMedia('(min-aspect-ratio: 1/1)').matches?landscapeHomeBackground:portraitHomeBackground;
 const cover=entries.find(asset=>asset.path===preferred)??entries.find(asset=>homeBackgrounds.some(path=>path===asset.path));
 const game=entries.filter(({path})=>path.startsWith('art/game/')||path.startsWith('art/shot/')||path.startsWith('art/shot-status/')
  ||path==='art/players/high-potential-rookie.png'||path==='art/scheme-a/design-atlas.png');
 return cover?[cover,...game]:game;
}
