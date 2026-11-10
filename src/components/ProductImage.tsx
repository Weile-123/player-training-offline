import {assetUrl} from '../presentation/assetUrls';
const consumableIcons:Record<string,string>={item_001:'brace',item_002:'timer',item_003:'chalk',item_004:'supplement',item_005:'drink'};
export function productImagePath(id:string){return assetUrl(`art/${consumableIcons[id]?`consumables/${consumableIcons[id]}`:`products/${id}`}.png`);}
export function ProductImage({id,name}:{id:string;name:string}){
 return <img className="product-image" src={productImagePath(id)} alt={`${name}商品图`} loading="lazy" decoding="async" width="96" height="96"/>;
}
