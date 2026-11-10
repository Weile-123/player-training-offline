import { equipmentOfferPrice } from '../game/contract/engine';
import { RewardedAdButton } from './RewardedAdButton';
import { assetUrl } from '../presentation/assetUrls';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { openSponsorPost } from '../platform/sponsorPosting';
import { useContract } from '../contractStore';
import { shopCatalog, shopEntry, rerollPrice, purchasePrice } from '../game/contract/commerce';
import { equipmentName, equipmentDescription, itemCatalog } from '../game/contract/catalog';
import { unlockDescriptions } from '../game/contract/progression';
import { ProductImage } from './ProductImage';
import { GameIcon } from './GameIcon';
import { SponsorTicket } from './DeliveryScoreboard';
import { money } from './ContractPanels';
import { ComicDialog } from './ComicDialog';
import { canBuyMerchantOffer } from '../presentation/merchant';

const rarityNames = { common: '普通', rare: '稀有', legendary: '传说' };


export function ContractShop() {
    const store = useContract(), g = store.state, full = g.equipment.length >= 8;
    const shop = useRef<HTMLDivElement>(null), [couponHelp, setCouponHelp] = useState(false);
    const [sharing, setSharing] = useState(false), [shareError, setShareError] = useState('');
    const [shareStage,setShareStage]=useState('正在打开发帖…');
    const shareLock = useRef(false), alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const shareAvailable = g.status === 'playing' && (g.sponsorShareMonth === undefined || g.month - g.sponsorShareMonth >= 3);
    const share = async () => {
        if (shareLock.current || !shareAvailable) return;
        shareLock.current = true; setSharing(true); setShareError('');
        const careerId = g.careerId ?? '', month = g.month;
        try {
            if (import.meta.env.DEV && store.debug.mockPosterShare) await new Promise(resolve => setTimeout(resolve, 1000));
            else await openSponsorPost({month,delivered:g.delivered,totalShots:g.totalShots},text=>{if(alive.current)setShareStage(text);});
            const result = useContract.getState().act({ type: 'sponsor-share-reward', careerId, month });
            if (result.error && alive.current) setShareError('生涯状态已变化，本次未领取，请返回商店重试。');
        } catch (error) { if (alive.current) setShareError(error instanceof Error ? error.message : '分享暂不可用，请稍后重试'); }
        finally { shareLock.current = false; if (alive.current) setSharing(false); }
    };
    const shareButton = (label: string) => shareAvailable ? <button className="sponsor-share-button" disabled={sharing} onClick={() => void share()}>{sharing ? shareStage : label}</button> : null;
    useLayoutEffect(() => {
        const dialog = shop.current?.closest<HTMLElement>('.equipment-dialog');
        if (!dialog) return;
        let retained = 0;
        const remember = () => {
            const height = dialog.getBoundingClientRect().height;
            if (height > retained + .5) { retained = height; dialog.style.setProperty('--shop-retained-height', `${height}px`); }
        };
        const resize = () => { retained = 0; dialog.style.removeProperty('--shop-retained-height'); };
        const observer = new ResizeObserver(remember); observer.observe(dialog); remember();
        window.addEventListener('resize', resize);
        return () => { observer.disconnect(); window.removeEventListener('resize', resize); dialog.style.removeProperty('--shop-retained-height'); };
    }, []);
    const free = g.equipment.includes('relic_043') && !g.commerce.shop.freeUsed;
    const price = rerollPrice(g.month, g.commerce.shop.paidRerolls);
    if (g.commerce.shop.giftAvailable) return <p>请先在首月赠礼弹窗选择开营器械。</p>;
    return <div ref={shop} className="commerce-view equipment-shop">
        <div className="shop-wallet">
            <div><SponsorTicket /><span><small className="wallet-coupon-label">赞助券<button className="coupon-help-button" aria-label="赞助券怎么获得" onClick={() => setCouponHelp(true)}>?</button></small><span className="wallet-coupon-actions"><b className="wallet-coupons">{g.credits.toLocaleString()}</b>{shareButton('分享·赞助券+1')}</span></span></div>
            <div><GameIcon name="assets" /><span><small>经费</small><b title={money(g.cash)}>{money(g.cash)}</b></span></div>
        </div>
        {shareError && <div className="sponsor-share-error" role="alert" onClick={() => setShareError('')}>{shareError}<button aria-label="关闭分享提示" onClick={() => setShareError('')}>×</button></div>}
        {couponHelp && <ComicDialog title="赞助券怎么获得？" onClose={() => setCouponHelp(false)} className="coupon-help-dialog">
            <section className="coupon-method"><div className="coupon-method-art"><i>01</i><GameIcon name="handoff" /></div><div><h3>推荐签约</h3><p>在「球员」或「休息室」中推荐签约</p><strong>每名球员可换 1 张赞助券</strong><p className="coupon-method-note">签约后离营，部分器械可增加获得数量。</p></div></section>
            <section className="coupon-method"><div className="coupon-method-art"><i>02</i><SponsorTicket /></div><div><h3>分享发帖 <small>每 3 个月一次</small></h3><p>分享训练营养成记录，即可获得</p><strong>赞助券 ×1</strong>{shareButton('去分享')}{!shareAvailable && g.sponsorShareMonth !== undefined && <p className="coupon-method-note">已领取，第 {g.sponsorShareMonth + 3} 月可再次获取。</p>}</div></section>
        </ComicDialog>}
        <div className="equipment-scroll" role="region" aria-label="器材商品列表" tabIndex={0}><div className="commerce-products">{g.commerce.shop.offers.map(id => {
            const e = shopEntry(id)!, cost = equipmentOfferPrice(g, id);
            return <article className={`commerce-product equipment-product rarity-${e.rarity}`} key={id} data-product-id={id}>
                <div className="product-art"><ProductImage id={id} name={e.name} /></div>
                <div className="product-copy"><h3>{e.name}<small className="rarity-badge">{rarityNames[e.rarity]}</small></h3><p className="equipment-effect"><span>器材效果</span>{equipmentDescription(id)}</p>
                    <button className="primary commerce-buy" disabled={g.status === 'over' || (!g.commerce.shop.giftAvailable && g.credits < cost) || full} onClick={() => store.act({ type: 'buy-equipment', id })}>{full ? <span className="equipment-capacity-copy">已达上限（可在背包内弃置）</span> : <><SponsorTicket /><span>{`${cost} 赞助券 · 购买`}</span><i aria-hidden="true">›</i></>}</button>
                </div>
            </article>;
        })}</div>
            {!g.commerce.shop.offers.length && <div className="commerce-empty"><strong>{g.month === 1 ? '首月赠礼已领取' : '本轮器材已取完'}</strong><p>{g.month === 1 ? '第 2 月起，可用赞助券购买更多器材。' : '刷新商品，或下月再来挑选。'}</p></div>}
        </div>
        <footer className="shop-footer"><strong>已装备 <b>{g.equipment.length}/8</b></strong><button className="secondary" disabled={g.month === 1 || g.status === 'over' || (!free && BigInt(g.cash) < BigInt(price))} onClick={() => store.act({ type: 'reroll' })}><svg className="shop-refresh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7a9 9 0 1 0 1 9M20 3v5h-5" /></svg><span className="shop-refresh-label">{free ? '免费刷新（本月一次）' : `刷新商品 ${money(price)}`}</span></button><RewardedAdButton reward="legendary-shop" label="看广告·必得传说" gold /></footer>
    </div>;
}

export function ContractMerchant() {
    const store = useContract(), g = store.state, visiting = g.month >= 3 && g.month % 3 === 0;
    const [tab, setTab] = useState<'players' | 'items'>('players');
    return <div className="commerce-view scout-market">
        <div className="scout-market-hero"><div><strong>第 {g.month} 月 · {visiting ? '球探到访' : '等待球探'}</strong><span>经费</span><b title={money(g.cash)}>{money(g.cash)}</b></div><img src={assetUrl('art/scout/shop-color.png')} alt="球探摊位" /></div>
        {!visiting && <p className="market-caption">第 {Math.max(3, Math.ceil((g.month + 1) / 3) * 3)} 月再次来访</p>}
        <div className={`roster-tabs merchant-tabs ${tab === 'items' ? 'show-queued' : ''}`} role="tablist" aria-label="球探商品分类"><i aria-hidden="true" />{(['players', 'items'] as const).map(group => <button key={group} id={`merchant-tab-${group}`} role="tab" aria-selected={tab === group} aria-controls="merchant-page" tabIndex={tab === group ? 0 : -1} onClick={() => setTab(group)} onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'players' : e.key === 'End' ? 'items' : tab === 'players' ? 'items' : 'players'; setTab(next); document.getElementById(`merchant-tab-${next}`)?.focus(); } }}>{group === 'players' ? '球员招募' : '一次性物品'}</button>)}</div>
        <div id="merchant-page" role="tabpanel" aria-labelledby={`merchant-tab-${tab}`}>{([tab] as const).map(group => {
            const offers = g.commerce.merchant.offers.filter(o => (o.id === 'basic' || o.id === 'special') === (group === 'players'));
            if (!offers.length) return null;
            return <section className="market-section" key={group}><h3 className="commerce-section-title"><GameIcon name={group === 'players' ? 'people' : 'bag'} />{group === 'players' ? '球员招募' : '一次性物品'}</h3><div className="commerce-products">{offers.map(o => {
                const recruit = o.id === 'basic' || o.id === 'special', name = o.id === 'basic' ? '普通新人' : o.id === 'special' ? '高潜力新人' : itemCatalog.find(i => i.id === o.id)!.name;
                const exhausted = o.purchased >= o.stock, blocked = o.id === 'item_006' && (g.credit >= 3 || g.commerce.incenseUsed);
                return <article className={`commerce-product market-product ${exhausted ? 'is-depleted' : ''}`} key={o.id} data-product-id={o.id}>
                    <div className="product-art"><ProductImage id={o.id} name={name} /></div>
                    <div className="product-copy"><h3>{name}{o.id === 'special' && o.level > 0 && <small>训练 {o.level}</small>}</h3><p>{recruit ? `基础估值 ${o.id === 'basic' ? '$320' : '$640'}` : itemCatalog.find(i => i.id === o.id)!.description}</p>{recruit && <small className="recruit-note">属性与身高随机</small>}</div>
                    <div className="product-purchase"><small>剩余 {o.stock - o.purchased}/{o.stock}</small><button className="primary commerce-buy" disabled={!canBuyMerchantOffer(g, o)} onClick={() => store.act({ type: 'buy-merchant', id: o.id })}>{exhausted ? '已售罄' : blocked ? '暂不可购买' : `购买 ${money(purchasePrice(o))}`}</button></div>
                </article>;
            })}</div></section>;
        })}</div>
        {!g.commerce.merchant.offers.length && <div className="commerce-empty"><strong>本月暂无球探商品</strong><p>先训练和交付球员，积累经营经费。</p></div>}
        {visiting && <div className="market-ad-footer"><RewardedAdButton reward="merchant-refresh" label="看广告·刷新并重置" /></div>}
    </div>;
}

export function ContractInventory() {
    const store = useContract(), g = store.state, [discard, setDiscard] = useState<string | null>(null), [showUnlocks, setShowUnlocks] = useState(false);
    const locked = shopCatalog.filter(e => e.locked), unlocked = locked.filter(e => store.profile.unlocked.includes(e.id)).length;
    return <div className="commerce-view inventory-view">
        <h3 className="inventory-heading"><GameIcon name="bag" /><span>已装备器材</span><b>{g.equipment.length}/8</b></h3>
        <div className="commerce-products" aria-label="已装备器材">
            {g.equipment.map(id => <article className="commerce-product inventory-product" key={id} data-product-id={id}><div className="product-art"><ProductImage id={id} name={equipmentName(id)} /></div><div className="product-copy"><h3>{equipmentName(id)}</h3><p>{equipmentDescription(id)}</p></div><div className="product-purchase"><small className={`rarity-badge rarity-${shopEntry(id)?.rarity}`}>{rarityNames[shopEntry(id)?.rarity ?? 'common']}</small><button className={`secondary${discard === id ? ' discard-confirm' : ''}`} disabled={g.status === 'over'} onBlur={() => setDiscard(null)} onClick={() => { if (discard === id) { store.act({ type: 'discard-equipment', id }); setDiscard(null); } else setDiscard(id); }}>{discard === id ? '确认弃置（无返还）' : '弃置器材'}</button></div></article>)}
            {!g.equipment.length && <div className="commerce-empty"><GameIcon name="bag" /><strong>暂未装备器材</strong><p>开营时选择首月赠礼，之后可在商店使用赞助券购买。</p></div>}
        </div>
        <button className="inventory-unlocks inventory-unlocks-trigger" onClick={() => setShowUnlocks(true)} aria-haspopup="dialog"><span>永久器材解锁</span><b>{unlocked}/{locked.length}</b><progress aria-label="永久器材解锁进度" value={unlocked} max={locked.length} /></button>
        {showUnlocks && <ComicDialog title="永久器材解锁" className="commerce-dialog unlocks-dialog" onClose={() => setShowUnlocks(false)}><div className="contract-panel unlocks-panel"><div className="unlock-progress"><progress aria-label="器材解锁进度" value={unlocked} max={locked.length} /><b>{unlocked}/{locked.length}</b></div><p>完成条件后进入商店池，仍需赞助券购买。</p>{locked.map(e => { const owned = store.profile.unlocked.includes(e.id); return <article className={`unlock-card ${owned ? 'is-unlocked' : ''}`} key={e.id}><ProductImage id={e.id} name={e.name} /><div><h3>{e.name}</h3><p>{!owned && <span className="unlock-condition">条件</span>}{owned ? equipmentDescription(e.id) : unlockDescriptions[e.id]}</p></div><small>{owned ? '已解锁' : '待解锁'}</small></article>; })}</div></ComicDialog>}
    </div>;
}
