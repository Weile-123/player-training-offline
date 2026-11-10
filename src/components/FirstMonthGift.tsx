import {useContract} from '../contractStore';
import {equipmentName,equipmentDescription} from '../game/contract/catalog';
import {ComicDialog} from './ComicDialog';
import {ProductImage} from './ProductImage';
import './Onboarding.css';

export function FirstMonthGift(){
 const store=useContract();
 return <ComicDialog title="首月赠礼" dismissible={false} onClose={()=>{}} className="first-gift-dialog">
  <div className="first-gift-content"><p>新生涯从第 1 月开始。选择一件器械，免费带入训练营。</p><strong className="first-gift-caption">三选一 · 点击领取后开始正式训练</strong>
   <div className="first-gift-options">{store.state.commerce.shop.offers.map(id=><button key={id} className="first-gift-option" aria-label={`选择${equipmentName(id)}`} onClick={()=>store.act({type:'buy-equipment',id})}>
    <ProductImage id={id} name={equipmentName(id)}/><span><strong>{equipmentName(id)}</strong><small>{equipmentDescription(id)}</small></span><b>免费领取 <i aria-hidden="true">›</i></b>
   </button>)}</div>
   {store.actionError&&<p role="alert">{store.actionError}</p>}
  </div>
 </ComicDialog>;
}
