/** Keep the home, court animation and short-lived shot feedback ready before play.
 * Shop, collection, career and optional illustrations load when their UI mounts.
 * Do not warm the entire catalog in the background on mobile connections.
 */
export function selectStartupAssets<T extends {path:string}>(entries:readonly T[]):T[]{
 const paths=new Set(entries.map(entry=>entry.path));
 return entries.filter(({path})=>
  (path.startsWith('art/home/')&&path!=='art/home/background-continuous.png'&&!(path.endsWith('.png')&&paths.has(path.replace(/\.png$/,'.webp'))))||
  path.startsWith('art/game/')||path.startsWith('art/shot/')||path.startsWith('art/shot-status/')||
  path==='art/collection/court-lines.svg');
}
