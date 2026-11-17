import {afterEach, beforeEach, expect, it} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {useState, type ComponentType} from 'react';
import {act} from 'preact/test-utils';
import {cooperationOffers, newGym, dispatchGym, staminaMax, type GymAction, type GymState} from '../../src/game/gym/engine';
import {equipmentCatalog, type EquipmentEffects} from '../../src/game/gym/catalog';
import {templateRules} from '../../src/game/contract/templates';
import {ComicDialog} from '../../src/components/ComicDialog';
import {productImagePath} from '../../src/components/ProductImage';
import {GymAlumniPanel, GymClubPanel, GymCollectionPanel, GymCooperationPanel, GymInventoryPanel, GymOfflineReport, GymRecommendPanel, GymRosterPanel, GymShopPanel, TrainingAdvice, type GymPanelProps} from '../../src/components/GymPanels';
import {offlineLimitMs, type OfflineTrainingReport} from '../../src/game/gym/offline';
import {equipmentSummary} from '../../src/presentation/equipmentSummary';

const at = 1_800_000_000_000;
let root: Root | null = null;
let latest: GymState;
let actions: GymAction[];
let actionError: string | undefined;

beforeEach(() => { actions = []; actionError = undefined; });
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

async function mount(Panel: ComponentType<GymPanelProps>, initial: GymState, busy = false) {
  let time = initial.updatedAt;
  function Scene() {
    const [state, setState] = useState(initial);
    latest = state;
    const onAction = (action: GymAction) => {
      actions.push(action);
      const result = dispatchGym(state, state.revision, action, ++time);
      actionError = result.error;
      setState(result.state);
    };
    return <ComicDialog title="经营面板" onClose={() => {}}><Panel state={state} onAction={onAction} onClose={() => {}} busy={busy}/></ComicDialog>;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<Scene/>));
}

function buttonWithin(scope: ParentNode, text: string) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(text) || item.getAttribute('aria-label')?.includes(text));
  expect(button, text).toBeTruthy();
  return button!;
}

function product(name: string) {
  const card = [...document.querySelectorAll<HTMLElement>('.gm-product, .gm-consumable-card')].find(item => item.querySelector('h4')?.textContent === name);
  expect(card, name).toBeTruthy();
  return card!;
}

async function press(button: HTMLButtonElement) {
  await act(async () => button.click());
}

function equipmentFor(effect: keyof EquipmentEffects, grade = 1) {
  const item = equipmentCatalog.find(item => item.grade === grade && typeof item.effects[effect] === 'number' && (item.effects[effect] as number) > 0);
  expect(item, `${effect} grade ${grade}`).toBeTruthy();
  return item!;
}

function TrainingAdvicePanel({state}: GymPanelProps) {return <TrainingAdvice state={state}/>;}

it.each([12, 99])('uses stamina and experience meters without compact bonus advice in roster at level %s', async level => {
  Object.defineProperty(document, 'fonts', {configurable: true, value: {ready: Promise.resolve()}});
  const state = newGym(at, 19);
  state.player!.level = state.player!.peakLevel = level;
  state.player!.stamina = 7;
  state.player!.experience = level === 99 ? 0 : 10;
  await mount(GymRosterPanel, state);
  const row = document.querySelector('.roster-card')!;
  const stamina = row.querySelector('[role="progressbar"][aria-label$="体力"]')!;
  const experience = row.querySelector('[role="progressbar"][aria-label$="训练经验"]')!;
  expect(stamina.getAttribute('aria-valuenow')).toBe('7');
  expect(stamina.getAttribute('aria-valuemax')).toBe('20');
  expect(experience.getAttribute('aria-valuenow')).toBe(level === 99 ? '1' : '10');
  expect(Number(experience.getAttribute('aria-valuemax'))).toBeGreaterThan(0);
  expect(parseFloat(experience.querySelector<HTMLElement>('i')!.style.width)).toBeCloseTo(level === 99 ? 100 : 10 / Number(experience.getAttribute('aria-valuemax')) * 100);
  expect(row.textContent).not.toContain('手动 1秒/球');
  expect(row.querySelector('.gm-training-advice')).toBeNull();
  expect(actions).toEqual([]);
});

it('shows a compact alumni summary and opens complete records without generated rookie names', async () => {
  const state = newGym(at, 20);
  const template = templateRules.find(item => item.tier === 'starter')!;
  const record = {...state.player!, name: '新秀 3', templateId: template.id, recommendedAt: at, rewardCredits: 2, rewardFame: 30, finalValue: '320'};
  state.alumni = [record, {...record, id: 'history-unmatched', name: '历史新秀', templateId: null}];
  await mount(GymAlumniPanel, state);
  const cards = [...document.querySelectorAll<HTMLElement>('.gm-alumnus')];
  const matched = cards.find(card => card.dataset.tier === 'starter')!;
  expect(matched.querySelector('strong')?.textContent).toBe(template.name);
  expect(matched.textContent).toContain('最终身价');
  expect(matched.textContent).toContain('$320.00');
  expect(matched.textContent).not.toContain('新秀 3');
  expect(matched.querySelector('.tier-portrait-frame')?.getAttribute('data-tier')).toBe('starter');
  expect(matched.querySelector('.tier-portrait-frame > .gm-alumni-portrait-surface.album-portrait-surface')).toBeTruthy();
  const historical = cards.find(card => card.dataset.tier === 'undiscovered')!;
  expect(historical.querySelector('strong')?.textContent).toBe('历史新秀');
  expect(document.querySelector('.gm-alumni-list')?.textContent).toContain('Lv.');
  await press(matched as HTMLButtonElement);
  const detail = document.querySelector('.gm-detail-dialog')!;
  expect(detail.querySelector('.gm-player-identity h3')?.textContent).toBe(template.name);
  expect(detail.textContent).toContain('首发 · Lv.');
  expect(detail.textContent).not.toContain('新秀 3');
  expect(detail.querySelector('.gm-alumnus-heading .tier-portrait-frame > .gm-alumni-portrait-surface.album-portrait-surface')).toBeTruthy();
  expect(detail.querySelectorAll('.gm-stat-grid > div')).toHaveLength(6);
  expect(detail.textContent).toContain('赞助券 +2 · 球馆声望 +30');
  await press(buttonWithin(detail, '返回校友簿'));
  await press(historical as HTMLButtonElement);
  expect(document.querySelector('.gm-detail-dialog .gm-player-identity h3')?.textContent).toBe('历史新秀');
  expect(document.querySelector('.gm-detail-dialog .gm-eyebrow')?.textContent).toContain('待发掘');
  expect(actions).toEqual([]);
});

function own(state: GymState, installed: string[], warehouse: string[] = []) {
  state.ownedEquipment = [...installed, ...warehouse];
  state.equippedEquipment = [...installed];
  state.collectedEquipment = Object.fromEntries(state.ownedEquipment.map(id => [id, {firstAt: at}]));
  state.purchasePrices = Object.fromEntries(state.ownedEquipment.map(id => [id, equipmentCatalog.find(item => item.id === id)!.price]));
}

async function chooseReplacement(id: string) {
  await press(document.querySelector<HTMLButtonElement>(`.gm-replacement-option[data-equipment-id="${id}"]`)!);
}

async function inventoryManage(name: string, action: string) {
  if (!document.querySelector('.equipment-detail')) await press(buttonWithin(product(name), '器材详情'));
  await press(buttonWithin(document.querySelector('.equipment-detail')!, action));
}

async function chooseInventorySlot(id: string) {
  await press(document.querySelector<HTMLButtonElement>(`.gm-slot[data-equipment-id="${id}"]`)!);
}

it('unloads a sole active capacity item with a cancellable preview, then reinstalls and sells from the warehouse', async () => {
  const state = newGym(at, 11), item = equipmentFor('stamina');
  own(state, [item.id]); state.player!.stamina = 24;
  await mount(GymInventoryPanel, state);
  await inventoryManage(item.name, '移入仓库');
  expect(document.body.textContent).toContain('移出球馆后体力上限 24 → 20，当前体力 24 → 20');
  expect(document.body.textContent).toContain('再次放入不会补回体力');
  expect(document.querySelector('[aria-label="器材培养耗时对比"]')).toBeTruthy();
  await press(buttonWithin(document, '保留馆内器材'));
  expect(actions).toEqual([]);
  expect(latest.player!.stamina).toBe(24);
  await inventoryManage(item.name, '移入仓库');
  const confirm = buttonWithin(document, '确认移入仓库');
  await act(async () => {confirm.click(); confirm.click();});
  expect(actions).toEqual([{type: 'unequip', id: item.id}]);
  expect(latest.equippedEquipment).toEqual([]);
  expect(latest.ownedEquipment).toEqual([item.id]);
  expect(latest.player!.stamina).toBe(20);
  expect(latest.credits).toBe(0);
  await press(buttonWithin(product(item.name), '装备'));
  expect(latest.equippedEquipment).toEqual([item.id]);
  expect(latest.player!.stamina).toBe(20);
  await inventoryManage(item.name, '移入仓库');
  await press(buttonWithin(document, '确认移入仓库'));
  await inventoryManage(item.name, '半价出售');
  await press(buttonWithin(document, '确认出售'));
  expect(latest.credits).toBe(1);
  expect(latest.ownedEquipment).toEqual([]);
  expect(latest.collectedEquipment[item.id]).toBeTruthy();
  expect(actionError).toBeUndefined();
});

it('keeps unload controls disabled while an inventory operation is busy', async () => {
  const state = newGym(at, 11), item = equipmentFor('stamina'); own(state, [item.id]);
  await mount(GymInventoryPanel, state, true);
  await press(buttonWithin(product(item.name), '器材详情'));
  const unload = buttonWithin(document.querySelector('.equipment-detail')!, '移入仓库');
  expect(unload.disabled).toBe(true);
  await press(unload);
  expect(actions).toEqual([]);
  expect(document.querySelector('[aria-label="器材培养耗时对比"]')).toBeNull();
});

it('keeps equipment archives focused on the original art and effect without previews, conditions or ownership status', async () => {
  const state = newGym(at, 11); state.credits = 20;
  const item = equipmentFor('experience');
  await mount(GymShopPanel, state);
  expect(document.querySelector('[aria-label="器材培养耗时对比"]')).toBeNull();
  await press(buttonWithin(product(item.name), '器材详情'));
  const archive = document.querySelector('.equipment-detail')!;
  expect(archive.querySelector('.equipment-display img')?.getAttribute('src')).toBe(productImagePath(item.artId));
  expect(archive.querySelector('h3')?.textContent).toBe(item.name);
  expect(archive.querySelector('.equipment-effect')?.textContent).toContain(item.description);
  expect(archive.querySelector('.gm-equipment-extra')).toBeNull();
  expect(archive.querySelector('[aria-label="器材培养耗时对比"]')).toBeNull();
  expect(archive.querySelector('.equipment-collected')).toBeNull();
  expect(archive.textContent).not.toMatch(/入馆后|取得条件|已可购|尚未获得|当前未持有|售价/);
  await press(buttonWithin(archive, '返回'));
  expect(document.querySelector('.equipment-detail')).toBeNull();
  expect(latest).toEqual(state);
  expect(actions).toEqual([]);
});

it.each([25, 99])('shows actual effect changes without training-time predictions in level-%s replacements', async level => {
  const state = newGym(at, 11); state.player!.level = state.player!.peakLevel = level;
  state.gymLevel = 3; state.credits = 20;
  const basic = equipmentFor('experience'), item = equipmentFor('experience', 2);
  own(state, [basic.id]);
  await mount(GymShopPanel, state);
  await press(buttonWithin(product(item.name), '购买'));
  expect(document.querySelector('[aria-label="器材培养耗时对比"]')).toBeNull();
  expect(document.querySelector('select[aria-label="选择替换的器材"]')).toBeNull();
  const change = document.querySelector('[data-change-id="experience"]')!;
  expect(change.classList.contains('is-up')).toBe(true);
  expect(change.querySelector('b')?.textContent).toBe('1→2');
  expect(document.querySelectorAll('.gm-replacement-changes li')).toHaveLength(1);
  expect(actions).toEqual([{type: 'buy-equipment', id: item.id, destination: 'warehouse'}]);
});

it('opens project time comparisons on demand and retains the real charged upgrade flow', async () => {
  const state = newGym(at, 11); state.credits = 10;
  state.player!.stamina = 0; state.player!.recoveryMs = 9_500;
  await mount(GymClubPanel, state);
  await press(buttonWithin(document, '经营项目'));
  const card = [...document.querySelectorAll<HTMLElement>('.gm-project')].find(item => item.querySelector('h4')?.textContent === '恢复护理')!;
  expect(document.querySelector('[aria-label="项目培养耗时对比"]')).toBeNull();
  await press(buttonWithin(card, '查看恢复护理详情'));
  const comparison = document.querySelector('[aria-label="项目培养耗时对比"]')!;
  expect(comparison.querySelectorAll('[data-forecast-level]')).toHaveLength(2);
  expect(comparison.textContent).toContain('项目升一级后');
  expect(actions).toEqual([]);
  expect(latest.player!.stamina).toBe(0);
  await press(buttonWithin(document, '返回经营项目'));
  await press(buttonWithin(card, '升级'));
  expect(latest.projects.recovery).toBe(1);
  expect(latest.credits).toBe(9);
  expect(latest.player!.stamina).toBe(0);
  expect(latest.player!.recoveryMs).toBeLessThan(9_500);
  expect(actionError).toBeUndefined();
});

it('buys a permanent item directly into the gym without refilling stamina or a second activation', async () => {
  const state = newGym(at, 11);
  const item = equipmentFor('stamina');
  const itemPrice = item.price;
  state.credits = itemPrice + 1;
  state.player!.stamina = 15;
  await mount(GymShopPanel, state);
  expect(document.querySelectorAll('.gm-product')).toHaveLength(35);
  for (const original of equipmentCatalog) {
    const row = document.querySelector<HTMLElement>(`[data-equipment-id="${original.id}"]`)!;
    const image = row.querySelector('img');
    expect(image?.getAttribute('src')).toBe(productImagePath(original.artId));
    expect(image?.getAttribute('alt')).toBe(`${original.name}商品图`);
    expect(row.querySelector('h4')?.textContent).toBe(original.name);
  }
  expect(item.artId).not.toBe(item.id);
  await press(buttonWithin(product(item.name), '购买'));
  expect(latest.credits).toBe(1);
  expect(latest.ownedEquipment).toContain(item.id);
  expect(latest.collectedEquipment[item.id]).toBeTruthy();
  expect(latest.equippedEquipment).toEqual([item.id]);
  expect(latest.purchasePrices[item.id]).toBe(itemPrice);
  expect(actions).toEqual([{type: 'buy-equipment', id: item.id}]);
  expect(latest.ownedEquipment).not.toContain(item.artId);
  expect(latest.player!.stamina).toBe(15);
  expect(product(item.name).querySelector('.gm-shop-purchased-stamp')?.textContent).toBe('已购买');
  expect(buttonWithin(product(item.name), '购买').disabled).toBe(true);
  expect([...document.querySelectorAll<HTMLElement>('.gm-shop-product')].at(-1)?.dataset.equipmentId).toBe(item.id);
  expect(product(item.name).textContent).not.toContain('启用器材');
  const rules = [...document.querySelectorAll('.gm-product-copy p')].map(item => item.textContent).join(' ');
  expect(rules).not.toMatch(/轻伤|重伤|交付|信用|经费|成功权重/);
  expect(actionError).toBeUndefined();
});

it('uses paired original art in warehouse cards, active slots, details and collection without remapping shared image paths', async () => {
  const state = newGym(at, 11);
  const installed = equipmentFor('stamina');
  const warehouse = equipmentFor('experience');
  own(state, [installed.id], [warehouse.id]);
  await mount(GymInventoryPanel, state);
  expect(product(installed.name).querySelector('img')!.getAttribute('src')).toBe(productImagePath(installed.artId));
  expect(product(warehouse.name).querySelector('img')!.getAttribute('src')).toBe(productImagePath(warehouse.artId));
  expect(document.querySelector('.gm-slot img')!.getAttribute('src')).toBe(productImagePath(installed.artId));
  expect(productImagePath(installed.id)).not.toBe(productImagePath(installed.artId));
  await press(buttonWithin(product(warehouse.name), '器材详情'));
  expect(document.querySelector('.equipment-display img')!.getAttribute('src')).toBe(productImagePath(warehouse.artId));
  expect(document.querySelector('.equipment-detail h3')!.textContent).toBe(warehouse.name);
  expect(actions).toEqual([]);
  await act(async () => root!.unmount()); root = null;
  await mount(GymCollectionPanel, state);
  await press(buttonWithin(document, '器材图鉴'));
  for (const item of [installed, warehouse]) {
    const card = [...document.querySelectorAll<HTMLButtonElement>('.equipment-album-card')].find(card => card.querySelector('strong')?.textContent === item.name)!;
    expect(card.querySelector('img')!.getAttribute('src')).toBe(productImagePath(item.artId));
  }
  const collected = [...document.querySelectorAll<HTMLButtonElement>('.equipment-album-card')].find(card => card.querySelector('strong')?.textContent === installed.name)!;
  await press(collected);
  expect(document.querySelector('.equipment-display img')!.getAttribute('src')).toBe(productImagePath(installed.artId));
  expect(document.querySelector('.equipment-detail h3')!.textContent).toBe(installed.name);
  expect(latest.ownedEquipment).toEqual([installed.id, warehouse.id]);
  expect(Object.keys(latest.collectedEquipment)).toEqual([installed.id, warehouse.id]);
  expect(actions).toEqual([]);
});

it('replaces a full gym from the warehouse atomically and can cancel without moving equipment', async () => {
  const state = newGym(at, 11);
  const installed = ['stamina', 'recovery', 'courseRecovery', 'valuePercent'].map(effect => equipmentFor(effect as keyof EquipmentEffects));
  const incoming = equipmentFor('experience');
  own(state, installed.map(item => item.id), [incoming.id]);
  await mount(GymInventoryPanel, state);
  await press(buttonWithin(product(incoming.name), '装备'));
  expect(document.querySelectorAll('.gm-slot.is-replaceable')).toHaveLength(4);
  expect(document.querySelector('.gm-replacement-note')?.textContent).toContain('装备栏已满');
  expect(document.querySelector('[aria-label="选择替换的器材"]')).toBeNull();
  await press(buttonWithin(document, '取消替换'));
  expect(actions).toEqual([]);
  expect(latest.equippedEquipment).toEqual(state.equippedEquipment);
  await press(buttonWithin(product(incoming.name), '装备'));
  await chooseInventorySlot(installed[0].id);
  expect(latest.equippedEquipment).toHaveLength(4);
  expect(latest.equippedEquipment).toContain(incoming.id);
  expect(latest.equippedEquipment).not.toContain(installed[0].id);
  expect(latest.ownedEquipment).toHaveLength(5);
  expect(latest.collectedEquipment[installed[0].id]).toBeTruthy();
  expect(actionError).toBeUndefined();
});

it('uses the shared card in the warehouse, disables equipped items and clears replacement selection across tabs', async () => {
  const state = newGym(at, 12);
  const installed = ['stamina', 'recovery', 'courseRecovery', 'valuePercent'].map(effect => equipmentFor(effect as keyof EquipmentEffects));
  const incoming = equipmentFor('experience');
  own(state, installed.map(item => item.id), [incoming.id]);
  await mount(GymInventoryPanel, state);
  expect(document.querySelectorAll('.gm-inventory .gm-shop-product')).toHaveLength(5);
  expect(product(incoming.name).querySelector('.gm-equipment-summary')?.textContent).toBe(equipmentSummary(incoming));
  expect(buttonWithin(product(installed[0].name), '已装备').disabled).toBe(true);
  await press(buttonWithin(product(incoming.name), '装备'));
  expect(document.querySelector('.gm-slot-row.is-replacing')).toBeTruthy();
  await press(buttonWithin(document, '消耗品'));
  expect(document.querySelector('.gm-replacement-note')).toBeNull();
  await press(buttonWithin(document, '器材仓库'));
  expect(document.querySelector('.gm-slot-row.is-replacing')).toBeNull();
  expect(actions).toEqual([]);
  await press(buttonWithin(product(incoming.name), '装备'));
  const slot = document.querySelector<HTMLButtonElement>(`.gm-slot[data-equipment-id="${installed[0].id}"]`)!;
  await act(async () => {slot.click(); slot.click();});
  expect(actions).toEqual([{type: 'equip', id: incoming.id, replaceId: installed[0].id}]);
  expect(latest.equippedEquipment).toContain(incoming.id);
  expect(latest.ownedEquipment).toContain(installed[0].id);
});

it('requires a same-family replacement even with free slots and never highlights unrelated equipment', async () => {
  const state = newGym(at, 13), basic = equipmentFor('stamina'), advanced = equipmentFor('stamina', 2), other = equipmentFor('experience');
  own(state, [basic.id, other.id], [advanced.id]);
  await mount(GymInventoryPanel, state);
  await press(buttonWithin(product(advanced.name), '装备'));
  expect(document.querySelectorAll('.gm-slot.is-replaceable')).toHaveLength(1);
  const otherSlot = document.querySelector<HTMLButtonElement>(`.gm-slot[data-equipment-id="${other.id}"]`)!;
  expect(otherSlot.disabled).toBe(true);
  await chooseInventorySlot(basic.id);
  expect(latest.equippedEquipment).toEqual([other.id, advanced.id]);
  expect(actionError).toBeUndefined();
});

it('pays into the warehouse before a full-gym replacement and refunds a later sale once', async () => {
  const state = newGym(at, 11);
  state.credits = 30;
  const installed = ['stamina', 'recovery', 'courseRecovery', 'valuePercent'].map(effect => equipmentFor(effect as keyof EquipmentEffects));
  const incoming = equipmentFor('experience');
  const outgoing = installed[0];
  own(state, installed.map(item => item.id));
  await mount(GymShopPanel, state);
  await press(buttonWithin(product(incoming.name), '购买'));
  expect(latest.credits).toBe(30 - incoming.price);
  expect(latest.ownedEquipment).toContain(incoming.id);
  expect(latest.equippedEquipment).not.toContain(incoming.id);
  expect(buttonWithin(document, '确认替换').disabled).toBe(true);
  await chooseReplacement(outgoing.id);
  await press(buttonWithin(document, '确认替换'));
  expect(latest.equippedEquipment).toContain(incoming.id);
  expect(latest.equippedEquipment).not.toContain(outgoing.id);
  expect(latest.ownedEquipment).toContain(outgoing.id);
  const replaced = latest;
  const credits = replaced.credits;
  act(() => root!.unmount()); root = null;
  await mount(GymInventoryPanel, replaced);
  expect(product(outgoing.name).textContent).toContain('装备');
  await inventoryManage(outgoing.name, '半价出售');
  expect(document.body.textContent).toContain('收藏保留');
  await press(buttonWithin(document, '保留器材'));
  expect(latest.credits).toBe(credits);
  await inventoryManage(outgoing.name, '半价出售');
  const confirm = buttonWithin(document, '确认出售');
  await act(async () => {confirm.click(); confirm.click();});
  expect(actions.filter(action => action.type === 'sell-equipment')).toHaveLength(1);
  expect(latest.credits).toBe(credits + Math.floor(replaced.purchasePrices[outgoing.id] / 2));
  expect(latest.ownedEquipment).not.toContain(outgoing.id);
  expect(latest.collectedEquipment[outgoing.id]).toBeTruthy();
  expect(latest.purchasePrices[outgoing.id]).toBeUndefined();
  expect(actionError).toBeUndefined();
});

it('previews recovery lost when incoming brand-only equipment replaces a shooting machine', async () => {
  const state = newGym(at, 11);
  state.credits = 30;
  const recovery = equipmentFor('recovery');
  const brand = equipmentFor('valuePercent');
  own(state, [recovery, equipmentFor('stamina'), equipmentFor('courseRecovery'), equipmentFor('experience')].map(item => item.id));
  await mount(GymShopPanel, state);
  await press(buttonWithin(product(brand.name), '购买'));
  await chooseReplacement(recovery.id);
  const changes = document.querySelector('.gm-replacement-changes')!;
  expect(changes.querySelector('[data-change-id="recovery"] b')?.textContent).toBe('19 秒/点→20 秒/点');
  expect(changes.querySelector('[data-change-id="recovery"]')?.classList.contains('is-up')).toBe(true);
  expect(changes.querySelector('[data-change-id="brand"]')?.textContent).toContain('0%→10%');
  expect(changes.querySelector('[data-change-id="stamina-cap"]')).toBeNull();
  expect(changes.textContent).not.toContain('当前培养声望');
  expect(latest.credits).toBe(30 - brand.price);
  expect(actions).toEqual([{type: 'buy-equipment', id: brand.id, destination: 'warehouse'}]);
  await press(buttonWithin(document, '放入仓库'));
  expect(latest.equippedEquipment).toContain(recovery.id);
});

it('keeps a full-gym purchase paid and stored when the replacement dialog is closed', async () => {
  const state = newGym(at, 11); state.credits = 30;
  const installed = ['stamina', 'recovery', 'courseRecovery', 'valuePercent'].map(effect => equipmentFor(effect as keyof EquipmentEffects));
  const incoming = equipmentFor('experience'); own(state, installed.map(item => item.id));
  await mount(GymShopPanel, state);
  await press(buttonWithin(product(incoming.name), '购买'));
  const dialog = document.querySelector('.gm-replacement-options')!.closest('[role="dialog"]')!;
  await press(buttonWithin(dialog, '关闭面板'));
  expect(document.querySelector('.gm-replacement-options')).toBeNull();
  expect(latest.credits).toBe(30 - incoming.price);
  expect(latest.ownedEquipment).toContain(incoming.id);
  expect(latest.equippedEquipment).toEqual(installed.map(item => item.id));
  expect(product(incoming.name).querySelector('.gm-shop-purchased-stamp')?.textContent).toBe('已购买');
  expect(buttonWithin(product(incoming.name), '购买').disabled).toBe(true);
  expect(actions).toEqual([{type: 'buy-equipment', id: incoming.id, destination: 'warehouse'}]);
});

it('does not show a successful replacement or block retries if a purchase is not committed', async () => {
  const state = newGym(at, 11); state.credits = 30;
  const installed = ['stamina', 'recovery', 'courseRecovery', 'valuePercent'].map(effect => equipmentFor(effect as keyof EquipmentEffects));
  const incoming = equipmentFor('experience'); own(state, installed.map(item => item.id));
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymShopPanel state={state} onAction={action => actions.push(action)}/>));
  await press(buttonWithin(product(incoming.name), '购买'));
  expect(document.querySelector('.gm-replacement-options')).toBeNull();
  expect(state.credits).toBe(30);
  expect(state.ownedEquipment).not.toContain(incoming.id);
  await press(buttonWithin(product(incoming.name), '购买'));
  expect(actions).toHaveLength(2);
});

it('confirms and previews a same-family upgrade even when the gym has empty slots', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 3;
  state.credits = 30;
  state.player!.stamina = 15;
  const basic = equipmentFor('stamina');
  const advanced = equipmentFor('stamina', 2);
  own(state, [basic.id]);
  await mount(GymShopPanel, state);
  await press(buttonWithin(product(advanced.name), '购买'));
  expect(document.querySelector('[data-change-id="stamina-cap"]')?.textContent).toBe('体力上限24 点→30 点');
  const choices = [...document.querySelectorAll<HTMLButtonElement>('.gm-replacement-option')];
  expect(choices.map(choice => choice.dataset.equipmentId)).toEqual([basic.id]);
  expect(choices[0].getAttribute('aria-pressed')).toBe('true');
  expect(choices[0].querySelector('img')?.getAttribute('src')).toBe(productImagePath(basic.artId));
  expect(document.querySelector('.gm-replacement-options')!.parentElement!.textContent).toContain('同类只启用一件');
  expect(buttonWithin(document, '确认替换').disabled).toBe(false);
  expect(actions).toEqual([{type: 'buy-equipment', id: advanced.id, destination: 'warehouse'}]);
  await press(buttonWithin(document, '放入仓库'));
  expect(latest.equippedEquipment).toEqual([basic.id]);
  expect(latest.credits).toBe(30 - advanced.price);
  const stored = latest;
  act(() => root!.unmount()); root = null;
  await mount(GymInventoryPanel, stored);
  await press(buttonWithin(product(advanced.name), '装备'));
  await chooseInventorySlot(basic.id);
  expect(actions).toEqual([{type: 'buy-equipment', id: advanced.id, destination: 'warehouse'}, {type: 'equip', id: advanced.id, replaceId: basic.id}]);
  expect(latest.equippedEquipment).toEqual([advanced.id]);
  expect(latest.ownedEquipment).toContain(basic.id);
  expect(latest.player!.stamina).toBe(15);
  expect(latest.credits).toBe(30 - advanced.price);
  expect(actionError).toBeUndefined();
});

it('only allows the same family as a warehouse replacement when the gym is full', async () => {
  const state = newGym(at, 11);
  const basic = equipmentFor('stamina');
  const advanced = equipmentFor('stamina', 2);
  const other = ['recovery', 'courseRecovery', 'experience'].map(effect => equipmentFor(effect as keyof EquipmentEffects));
  own(state, [basic, ...other].map(item => item.id), [advanced.id]);
  await mount(GymInventoryPanel, state);
  await press(buttonWithin(product(advanced.name), '装备'));
  expect([...document.querySelectorAll<HTMLElement>('.gm-slot.is-replaceable')].map(slot => slot.dataset.equipmentId)).toEqual([basic.id]);
  expect(document.querySelector('.gm-replacement-note')?.textContent).toContain('同类仅启用一件');
  const unavailable = document.querySelector<HTMLButtonElement>(`.gm-slot[data-equipment-id="${other[0].id}"]`)!;
  expect(unavailable.disabled).toBe(true);
  await press(unavailable);
  expect(actions).toEqual([]);
  await chooseInventorySlot(basic.id);
  expect(latest.equippedEquipment).toEqual([...other.map(item => item.id), advanced.id]);
  expect(latest.ownedEquipment).toContain(basic.id);
  expect(actions).toEqual([{type: 'equip', id: advanced.id, replaceId: basic.id}]);
  expect(actionError).toBeUndefined();
});

it('removes filters, shows concise real effects on every card and keeps full descriptions in details', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 8;
  state.collection = Object.fromEntries(templateRules.slice(0, 8).map(template => [template.id, {firstAt: at, highestRating: 40, highestValue: '320'}]));
  await mount(GymShopPanel, state);
  const shelf = document.querySelector<HTMLElement>('.gm-shop-grid')!;
  expect(shelf.getAttribute('role')).toBe('region');
  expect(shelf.getAttribute('aria-label')).toBe('器材货架');
  expect(shelf.tabIndex).toBe(0);
  expect(document.querySelector('.gm-shop-filters')).toBeNull();
  expect(document.querySelectorAll('.gm-shop-product')).toHaveLength(35);
  for (const item of equipmentCatalog) {
    const summary = product(item.name).querySelector('.gm-equipment-summary')!;
    expect(summary.textContent).toBe(equipmentSummary(item));
    expect(summary.getAttribute('title')).toBe(item.description);
    expect(summary.textContent!.length).toBeLessThan(18);
  }
  for (const [effect, preview] of [
    ['experience', '每球器材经验 +0 → +3'],
    ['automationExperience', '自动每球额外经验 +0 → +3'],
    ['offlineMinutes', '每次离线训练上限 30分钟 → 1小时30分钟'],
  ] as const) {
    const item = equipmentFor(effect, 3);
    const row = product(item.name);
    expect(row.querySelectorAll('p')).toHaveLength(0);
    expect(row.querySelectorAll('button')).toHaveLength(2);
    expect(row.textContent).not.toContain(preview);
    await press(buttonWithin(row, '器材详情'));
    expect(document.querySelector('.equipment-effect')?.textContent).toContain(item.description);
    expect(document.querySelector('.equipment-detail')?.textContent).not.toContain(preview);
    await press(buttonWithin(document.querySelector('.equipment-detail')!, '返回'));
  }
  expect(actions).toEqual([]);
});

it('shows a complete specialty family with grade metadata and concise focus effects', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 8;
  state.collection = Object.fromEntries(templateRules.slice(0, 8).map(template => [template.id, {firstAt: at, highestRating: 40, highestValue: '320'}]));
  await mount(GymShopPanel, state);
  const entries = equipmentCatalog.filter(item => item.family === 'focus-defense');
  expect(document.querySelectorAll('[data-family="focus-defense"]')).toHaveLength(2);
  for (const item of entries) {
    expect(product(item.name).querySelector('.gm-product-meta')).toBeNull();
    expect(product(item.name).dataset.family).toBe(item.family);
    expect(product(item.name).dataset.grade).toBe(String(item.grade));
    expect(buttonWithin(product(item.name), '购买').className).toBe('gm-button gm-primary');
  }
  await press(buttonWithin(product(entries[1].name), '器材详情'));
  const detail = document.querySelector('.equipment-detail-dialog')!;
  expect(detail.textContent).toContain('防守专项 · 同类只启用一件');
  expect(detail.textContent).toContain('3阶');
  expect(actions).toEqual([]);
});

it('sorts affordable, listed, unlisted and owned stock without a price sort and refuses repurchase', async () => {
  const state = newGym(at, 13);
  state.credits = 4;
  state.gymLevel = 3;
  const installed = equipmentFor('stamina'), warehouse = equipmentFor('experience');
  own(state, [installed.id], [warehouse.id]);
  await mount(GymShopPanel, state);
  const unlocked = (item: typeof equipmentCatalog[number]) => state.gymLevel >= item.unlockLevel && Object.keys(state.collection).length >= item.requiredTemplates;
  const expected = [
    ...equipmentCatalog.filter(item => !state.ownedEquipment.includes(item.id) && unlocked(item) && state.credits >= item.price),
    ...equipmentCatalog.filter(item => !state.ownedEquipment.includes(item.id) && unlocked(item) && state.credits < item.price),
    ...equipmentCatalog.filter(item => !state.ownedEquipment.includes(item.id) && !unlocked(item)).sort((first, second) => first.unlockLevel - second.unlockLevel),
    ...equipmentCatalog.filter(item => state.ownedEquipment.includes(item.id)),
  ].map(item => item.id);
  expect([...document.querySelectorAll<HTMLElement>('.gm-shop-product')].map(item => item.dataset.equipmentId)).toEqual(expected);
  for (const item of [installed, warehouse]) {
    const row = product(item.name);
    expect(row.classList.contains('is-owned')).toBe(true);
    expect(row.querySelector('.gm-shop-owned-cover > .gm-shop-purchased-stamp')?.textContent).toBe('已购买');
    expect(row.querySelector('img')?.getAttribute('src')).toBe(productImagePath(item.artId));
    const purchased = buttonWithin(row, '购买');
    expect(purchased.disabled).toBe(true);
    await press(purchased);
    expect(actions).toEqual([]);
    await press(buttonWithin(row, '器材详情'));
    expect(document.querySelector('.equipment-detail h3')?.textContent).toBe(item.name);
    await press(buttonWithin(document.querySelector('.equipment-detail')!, '返回'));
  }
  const locked = equipmentFor('experience', 3);
  const row = product(locked.name);
  expect(row.querySelector('img')?.getAttribute('src')).toBe(productImagePath(locked.artId));
  expect(buttonWithin(row, '购买').disabled).toBe(true);
  expect(buttonWithin(row, '器材详情').disabled).toBe(false);
  expect(row.querySelector('.gm-shop-lock')?.textContent).toContain('尚未上架');
  expect(actions).toEqual([]);
});

it('keeps unlocked but unaffordable stock ahead of locked items without a lock overlay', async () => {
  const state = newGym(at, 15);
  state.gymLevel = 3;
  state.credits = 0;
  await mount(GymShopPanel, state);
  expect(document.querySelector('.gm-shop-grid')).toBeTruthy();
  const unlocked = equipmentCatalog.filter(item => item.unlockLevel <= 3 && item.requiredTemplates === 0);
  const rows = [...document.querySelectorAll<HTMLElement>('.gm-shop-product')];
  expect(rows.slice(0, unlocked.length).every(row => !row.classList.contains('is-locked'))).toBe(true);
  const expensive = [...unlocked].sort((first, second) => second.price - first.price)[0];
  expect(rows[0].dataset.equipmentId).toBe(unlocked[0].id);
  expect(product(expensive.name).querySelector('.gm-shop-lock')).toBeNull();
  const purchase = buttonWithin(product(expensive.name), '购买');
  expect(purchase.disabled).toBe(true);
  expect(purchase.title).toBe('赞助券不足');
  await press(purchase);
  expect(actions).toEqual([]);
});

it.each([1, 8])('shows original unlisted stock with listing conditions and read-only detail access at gym %s', async gymLevel => {
  const state = newGym(at, 16);
  state.gymLevel = gymLevel; state.credits = 100;
  const item = equipmentFor('experience', 3);
  await mount(GymShopPanel, state);
  const card = product(item.name);
  expect(card.classList.contains('is-locked')).toBe(true);
  expect(card.querySelector('img')?.getAttribute('src')).toBe(productImagePath(item.artId));
  expect(card.querySelector('img')?.getAttribute('alt')).toBe(`${item.name}商品图`);
  expect(buttonWithin(card, '购买').textContent).toContain(`· ${item.price} 券`);
  expect(card.dataset.rarity).toBe(item.rarity);
  expect(card.dataset.grade).toBe(String(item.grade));
  const conditions = card.querySelector('.gm-shop-lock')!;
  expect(conditions.textContent).toContain('尚未上架');
  expect(conditions.textContent).toContain(`球馆 Lv.${item.unlockLevel}`);
  expect(conditions.textContent).toContain(`收藏 ${item.requiredTemplates} 种球星模板`);
  const purchase = buttonWithin(card, '购买');
  expect(purchase.disabled).toBe(true);
  await press(purchase);
  expect(actions).toEqual([]);
  const details = buttonWithin(card, '器材详情');
  expect(details.disabled).toBe(false);
  await press(details);
  const archive = document.querySelector('.equipment-detail')!;
  expect(archive.querySelector('h3')?.textContent).toBe(item.name);
  expect(archive.querySelector('.equipment-display img')?.getAttribute('src')).toBe(productImagePath(item.artId));
  expect(archive.querySelector('.equipment-effect')?.textContent).toContain(item.description);
  expect(archive.querySelector('.gm-equipment-extra')).toBeNull();
  expect(archive.querySelector('[aria-label="器材培养耗时对比"]')).toBeNull();
  expect(archive.querySelector('.equipment-collected')).toBeNull();
  expect(latest).toEqual(state);
  expect(actions).toEqual([]);
});

it('shows capped offline replacement deltas without training time predictions', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 8;
  state.credits = 100;
  state.collection = Object.fromEntries(templateRules.slice(0, 8).map(template => [template.id, {firstAt: at, highestRating: 40, highestValue: '320'}]));
  state.projects.offline = 5;
  const basic = equipmentFor('offlineMinutes');
  const advanced = equipmentFor('offlineMinutes', 3);
  own(state, [basic.id]);
  await mount(GymShopPanel, state);
  await press(buttonWithin(product(advanced.name), '器材详情'));
  expect(document.querySelector('.equipment-effect')?.textContent).toContain(advanced.description);
  expect(document.querySelector('.equipment-detail')?.textContent).not.toContain('每次离线训练上限 3小时15分钟 → 4小时');
  await press(buttonWithin(document.querySelector('.equipment-detail')!, '返回'));
  await press(buttonWithin(product(advanced.name), '购买'));
  const confirmation = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '替换馆内器材')!;
  expect(confirmation.querySelector('[data-change-id="offline-limit"]')?.textContent).toBe('离线训练上限195 分钟→240 分钟');
  expect(confirmation.textContent).toContain(`可替换「${basic.name}」`);
  expect(confirmation.querySelector('[aria-label="器材培养耗时对比"]')).toBeNull();
  await press(buttonWithin(confirmation, '放入仓库'));
  expect(latest.credits).toBe(state.credits - advanced.price);
  expect(latest.equippedEquipment).toEqual([basic.id]);
  expect(latest.ownedEquipment).toContain(advanced.id);
  expect(actions).toEqual([{type: 'buy-equipment', id: advanced.id, destination: 'warehouse'}]);
});

it('keeps archived equipment collection counts separate from the current thirty-five items', async () => {
  const state = newGym(at, 11);
  state.legacyEquipmentCollection = {relic_005: {firstAt: at}, relic_009: {firstAt: at}};
  state.collectedEquipment[equipmentFor('stamina').id] = {firstAt: at};
  await mount(GymCollectionPanel, state);
  await press(buttonWithin(document, '器材图鉴'));
  expect(document.querySelector('.album-progress')!.textContent).toContain('1 / 35');
  expect(document.body.textContent).toContain('历史器材收藏 2 件已留档，不计入当前 35 件器材的收藏进度');
  expect(document.querySelectorAll('.equipment-album-card')).toHaveLength(35);
  expect(actions).toEqual([]);
});

it.each([false, true])('shows the active cooperation-equipment course progress without promising payment before all requirements (complete %s)', async complete => {
  const state = newGym(at, 11);
  state.gymLevel = 2;
  const item = equipmentFor('cooperationBonus');
  own(state, [item.id]);
  const player = state.player!;
  player.shots = 13;
  player.training.completedCourses = 1;
  player.training.shots = 3;
  player.equipmentTraining.cooperationCourses = [1, 0];
  player.equipmentTraining.cooperationCourseShots = [3, 0];
  player.cooperation = {id: cooperationOffers(state).find(offer => offer.kind === 'basic')!.id, playerId: player.id, acceptedShots: 0, acceptedCourses: 0};
  if (complete) player.templateId = templateRules.find(template => template.tier === 'rotation')!.id;
  await mount(GymCooperationPanel, state);
  const progress = document.querySelector('[aria-label="合作器材培养进度"]')!;
  expect(progress.textContent).toContain('完整课程 1/2');
  expect(progress.textContent).toContain('本课启用 3/10 球');
  expect(progress.textContent).not.toContain('资格已保留');
  if (complete) expect(progress.textContent).toContain('合作已达标，器材还差1整课');
  else {
    expect(progress.textContent).not.toContain('合作已达标');
    expect(document.querySelector('[role="status"]')!.textContent).not.toContain('推荐时额外获得');
  }
  const before = structuredClone(latest);
  await press(document.querySelector<HTMLButtonElement>('[aria-label="查看合作说明"]')!);
  const rules = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '合作说明')!;
  expect(rules.textContent).toContain('每课10球都须启用');
  expect(rules.textContent).toContain('完成2个完整课程');
  expect(rules.textContent).toContain('合作达标后推荐领取');
  await press(rules.querySelector<HTMLButtonElement>('[aria-label="关闭面板"]')!);
  expect(latest).toEqual(before);
  expect(actions).toEqual([]);
});

it('explains why a partly equipped current course will not count as a full equipment course', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 2;
  own(state, [equipmentFor('cooperationBonus').id]);
  const player = state.player!;
  player.shots = 17;
  player.training.completedCourses = 1;
  player.training.shots = 7;
  player.equipmentTraining.cooperationCourses = [1, 0];
  player.equipmentTraining.cooperationCourseShots = [3, 0];
  player.cooperation = {id: cooperationOffers(state).find(offer => offer.kind === 'basic')!.id, playerId: player.id, acceptedShots: 0, acceptedCourses: 0};
  await mount(GymCooperationPanel, state);
  const progress = document.querySelector('[aria-label="合作器材培养进度"]')!;
  expect(progress.textContent).toContain('本课非完整器材课程，下课起重新累计');
  expect(progress.textContent).toContain('本课启用 3/10 球');
  expect(actions).toEqual([]);
});

it('shows retained cooperation-equipment eligibility after removing gear while keeping the template condition explicit', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 5;
  own(state, [], [equipmentFor('cooperationBonus', 3).id]);
  const player = state.player!;
  player.shots = 20;
  player.training.completedCourses = 2;
  player.equipmentTraining.cooperationCourses = [2, 2];
  player.cooperation = {id: cooperationOffers(state).find(offer => offer.kind === 'basic')!.id, playerId: player.id, acceptedShots: 0, acceptedCourses: 0};
  await mount(GymCooperationPanel, state);
  const progress = document.querySelector('[aria-label="合作器材培养进度"]')!;
  expect(progress.textContent).toContain('已保留额外 2 券资格，合作达标后推荐领取');
  expect(progress.textContent).not.toContain('完整课程');
  expect(document.querySelector('[role="status"]')!.textContent).not.toContain('推荐时额外获得');
  await press(document.querySelector<HTMLButtonElement>('[aria-label="查看合作说明"]')!);
  const rules = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '合作说明')!;
  expect(rules.textContent).toContain('取得的资格不会因换下器材消失');
  expect(actions).toEqual([]);
});

it('does not add an equipment-progress section without active gear or previously earned eligibility', async () => {
  await mount(GymCooperationPanel, newGym(at, 11));
  expect(document.querySelector('[aria-label="合作器材培养进度"]')).toBeNull();
  expect(actions).toEqual([]);
});

it('uses one drink only for missing stamina and disables use at the cap', async () => {
  const state = newGym(at, 11);
  state.player!.stamina = 18;
  state.inventory.drink = 1;
  await mount(GymInventoryPanel, state);
  await press(buttonWithin(document, '消耗品'));
  expect(buttonWithin(product('运动饮料'), '使用饮料').disabled).toBe(false);
  await press(buttonWithin(product('运动饮料'), '使用饮料'));
  expect(latest.player!.stamina).toBe(20);
  expect(latest.inventory.drink).toBe(0);
  expect(buttonWithin(product('运动饮料'), '使用饮料').disabled).toBe(true);
  expect(latest.player!.level).toBe(0);
  expect(actionError).toBeUndefined();
});

it('offers automatic speed and offline-cap upgrades together from gym level two', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 8;
  state.credits = 100;
  await mount(GymClubPanel, state);
  await press(buttonWithin(document, '经营项目'));
  expect(staminaMax(latest)).toBe(20);
  expect(document.querySelector('.gm-project.is-future')).toBeNull();
  expect(actions).toEqual([]);
  const endurance = [...document.querySelectorAll<HTMLElement>('.gm-project')].find(card => card.querySelector('h4')?.textContent === '耐力训练')!;
  await press(buttonWithin(endurance, '升级'));
  expect(latest.projects.endurance).toBe(1);
  expect(latest.credits).toBe(99);
  expect(latest.player!.stamina).toBe(20);
  expect(staminaMax(latest)).toBe(25);
  const automation = [...document.querySelectorAll<HTMLElement>('.gm-project')].find(card => card.querySelector('h4')?.textContent === '自动训练')!;
  expect(automation.querySelector('.gm-project-change')?.textContent).toContain('2→1.8秒');
  expect(automation.textContent).toContain('每球经验 +1');
  await press(buttonWithin(automation, '查看自动训练详情'));
  const automationDetails = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '自动训练详情')!;
  expect(automationDetails.textContent).toContain('1.8 秒/球，每球额外 +1 经验，在线离线均生效');
  await press(buttonWithin(automationDetails, '返回经营项目'));
  await press(buttonWithin(automation, '升级'));
  expect(latest.projects.automation).toBe(1);
  expect(automation.querySelector('.gm-project-change')?.textContent).toContain('1.8→1.6秒');
  expect(latest.projects.offline).toBe(0);
  const offline = [...document.querySelectorAll<HTMLElement>('.gm-project')].find(card => card.querySelector('h4')?.textContent === '离线课表')!;
  expect(offline.textContent).toContain('训练上限30→45分钟');
  expect(offline.textContent).toContain('45分钟');
  await press(buttonWithin(offline, '升级'));
  expect(latest.projects.offline).toBe(1);
  expect(offlineLimitMs(latest)).toBe(2_700_000);
  expect(offline.querySelector('[aria-label="离线升级收益预估"]')).toBeNull();
  await press(buttonWithin(offline, '查看离线课表详情'));
  const offlineAdvice = document.querySelector('[aria-label="离线升级收益预估"]')!;
  expect(offlineAdvice.textContent).toContain('当前球员约');
  expect(offlineAdvice.textContent).toContain('模板、奖金节点提前推荐');
  expect(actionError).toBeUndefined();
});

it('explains the shared level-two unlock and prevents offline-cap purchases at level one', async () => {
  const state = newGym(at, 11);
  state.credits = 100;
  await mount(GymClubPanel, state);
  await press(buttonWithin(document, '经营项目'));
  const offline = [...document.querySelectorAll<HTMLElement>('.gm-project')].find(card => card.querySelector('h4')?.textContent === '离线课表')!;
  expect(offline.textContent).toContain('馆2开放');
  expect(offline.querySelector<HTMLButtonElement>('.gm-project-upgrade')!.disabled).toBe(true);
  await press(buttonWithin(offline, '查看离线课表详情'));
  const details = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '离线课表详情')!;
  expect(details.textContent).toContain('球馆 2 级免费获得 30 分钟离线训练');
  expect(actions).toEqual([]);
});

it('presents a capped offline report as saved training, with no claim or automatic recommendation', async () => {
  const report: OfflineTrainingReport = {
    from: at, to: at + 7_200_000, elapsedMs: 7_200_000, creditedMs: 1_800_000, capMs: 1_800_000, capped: true,
    totalShots: 30, totalExperience: 352,
    players: [{id: 'one', name: '新秀 1', shots: 30, xpGained: 352, levelBefore: 0, levelAfter: 8, staminaBefore: 20, staminaAfter: 20, templateBefore: null, templateAfter: null, courses: 3}],
  };
  let closed = 0;
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymOfflineReport report={report} onClose={() => {closed++;}}/>));
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('离线训练报告');
  expect(dialog.textContent).toContain('2小时');
  expect(dialog.textContent).toContain('30分钟');
  expect(dialog.querySelector('.athlete-level > span')?.textContent).toBe('Lv.0');
  expect(dialog.querySelector('.athlete-level > strong')?.textContent).toBe('8');
  expect(dialog.textContent).toContain('超出时长仅恢复体力');
  expect(dialog.textContent).toContain('已保存，无需领取');
  expect([...dialog.querySelectorAll('button')].some(button => button.textContent?.includes('领取'))).toBe(false);
  await press(buttonWithin(dialog, '继续培养'));
  expect(closed).toBe(1);
  expect(actions).toEqual([]);
});

it.each([false, true])('confirms the displayed reward and archives only a matched athlete (legend %s)', async legendary => {
  const state = newGym(at, 11);
  if (legendary) {
    const template = templateRules.find(item => item.tier === 'legend')!;
    state.player!.templateId = template.id;
    state.player!.height = template.height[0];
    state.player!.stats = {...template.stats};
    state.player!.level = 18;
    state.player!.peakLevel = 18;
    state.player!.highestTier = 'legend';
  } else {
    state.player!.cooperation = {id: cooperationOffers(state)[0].id, playerId: state.player!.id,
      acceptedShots: state.player!.shots, acceptedCourses: state.player!.training.completedCourses};
  }
  const id = state.player!.id;
  await mount(GymRecommendPanel, state);
  const confirm = buttonWithin(document, '确认推荐');
  expect(confirm.textContent).toContain(legendary ? '+12 券' : '+0 券');
  if (!legendary) {
    expect(document.body.textContent).toContain('未匹配模板，本次0券');
    expect(document.body.textContent).toContain('未达标，推荐后结束');
  }
  expect(document.querySelector('.gym-panel')!.textContent).not.toMatch(/交付|经费|信用/);
  await press(confirm);
  expect(latest.player).toBeNull();
  expect(latest.credits).toBe(legendary ? 12 : 0);
  expect(latest.alumni).toHaveLength(legendary ? 1 : 0);
  if (legendary) {
    expect(latest.alumni[0].id).toBe(id);
    expect(latest.alumni[0].rewardCredits).toBe(12);
  }
  expect(actionError).toBeUndefined();
});

it.each([
  {level: 10, tier: 'starter', bonus: 3, total: 5},
  {level: 15, tier: 'star', bonus: 7, total: 10},
  {level: 20, tier: 'superstar', bonus: 12, total: 16},
  {level: 25, tier: 'legend', bonus: 18, total: 23},
] as const)('presents and pays the Lv.$level/$tier training milestone without requiring courses', async ({level, tier, bonus, total}) => {
  const state = newGym(at, 17);
  const template = templateRules.find(entry => entry.tier === tier)!;
  Object.assign(state.player!, {level, peakLevel: level, templateId: template.id, height: template.height[0], stats: {...template.stats}});
  await mount(GymRecommendPanel, state);
  expect(document.querySelector('.gm-reward-breakdown')).toBeNull();
  await press(buttonWithin(document, '查看结算明细'));
  const row = [...document.querySelectorAll<HTMLElement>('.gm-reward-breakdown > div')].find(item => item.textContent?.includes('培养加奖'))!;
  expect(row.textContent).toContain(`Lv.${level}`);
  expect(row.textContent).toContain(`+${bonus} 券`);
  expect(row.textContent).not.toContain('课');
  await press(buttonWithin(document, '确认推荐'));
  expect(latest.credits).toBe(total);
  expect(latest.alumni[0].rewardCredits).toBe(total);
  expect(actionError).toBeUndefined();
});

it('displays and pays the maximum combined recommendation of 33 credits', async () => {
  const state = newGym(at, 18);
  state.gymLevel = 5;
  const template = templateRules.find(entry => entry.tier === 'legend')!;
  Object.assign(state.player!, {level: 25, peakLevel: 25, enteredGymLevel: 5, templateId: template.id, height: template.height[0], stats: {...template.stats}, shots: 50});
  state.player!.training.completedCourses = 5;
  state.player!.equipmentTraining.cooperationCourses = [2, 2];
  const offer = cooperationOffers(state).find(entry => entry.kind === 'legend')!;
  state.player!.cooperation = {id: offer.id, playerId: state.player!.id, acceptedShots: 0, acceptedCourses: 0};
  const equipment = equipmentCatalog.find(item => item.effects.cooperationBonus === 2)!;
  state.ownedEquipment = [equipment.id];
  state.equippedEquipment = [equipment.id];
  state.purchasePrices = {[equipment.id]: equipment.price};
  await mount(GymRecommendPanel, state);
  const confirm = buttonWithin(document, '确认推荐');
  expect(confirm.textContent).toContain('+33 券');
  await press(confirm);
  expect(latest.credits).toBe(33);
  expect(latest.alumni[0].rewardCredits).toBe(33);
  expect(actionError).toBeUndefined();
});

it('reads new-gym collection records separately from active ownership and opens the two real albums', async () => {
  const state = newGym(at, 11);
  const template = templateRules.find(item => item.tier === 'rotation')!;
  state.collection[template.id] = {firstAt: at, highestRating: 40, highestValue: '320'};
  const item = equipmentFor('stamina');
  state.collectedEquipment[item.id] = {firstAt: at};
  await mount(GymCollectionPanel, state);
  expect(document.querySelector('.album-progress')!.textContent).toContain('1 / 119');
  expect(document.querySelectorAll('.album-card.discovered')).toHaveLength(1);
  await press(buttonWithin(document, '器材图鉴'));
  expect(document.querySelector('.album-progress')!.textContent).toContain('1 / 35');
  const collected = document.querySelector<HTMLButtonElement>('.equipment-album-card.is-unlocked')!;
  expect(collected.textContent).toContain(item.name);
  expect(collected.classList.contains('is-unlocked')).toBe(true);
  await press(collected);
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  expect(document.body.textContent).toContain(`体力上限 +${item.effects.stamina}`);
  expect(actions).toEqual([]);
});

it('keeps uncollected album faces unknown while opening unlisted, historical and listed equipment details', async () => {
  const state = newGym(at, 18);
  const retained = equipmentFor('experience', 3);
  const unlisted = equipmentFor('stamina', 3);
  const listed = equipmentFor('stamina');
  state.collectedEquipment[retained.id] = {firstAt: at};
  await mount(GymCollectionPanel, state);
  await press(buttonWithin(document, '器材图鉴'));
  const unavailable = document.querySelector<HTMLButtonElement>(`[aria-label="查看${unlisted.name}器材档案"]`)!;
  expect(unavailable.disabled).toBe(false);
  expect(unavailable.textContent).toBe('未知器械');
  expect(unavailable.querySelector('img.product-image')).toBeNull();
  expect(unavailable.textContent).not.toContain(unlisted.name);
  await press(unavailable);
  expect(document.querySelector('.equipment-detail h3')?.textContent).toBe(unlisted.name);
  expect(document.querySelector('.equipment-effect')?.textContent).toContain(unlisted.description);
  expect(document.querySelector('.equipment-detail .gm-equipment-extra')).toBeNull();
  await press(buttonWithin(document.querySelector('.equipment-detail')!, '返回'));
  const historical = document.querySelector<HTMLButtonElement>(`[aria-label="查看${retained.name}器材档案"]`)!;
  expect(historical.disabled).toBe(false);
  await press(historical);
  expect(document.querySelector('.equipment-detail h3')?.textContent).toBe(retained.name);
  await press(buttonWithin(document.querySelector('.equipment-detail')!, '返回'));
  const available = document.querySelector<HTMLButtonElement>(`[aria-label="查看${listed.name}器材档案"]`)!;
  expect(available.disabled).toBe(false);
  await press(available);
  expect(document.querySelector('.equipment-detail h3')?.textContent).toBe(listed.name);
  expect(actions).toEqual([]);
});

it('explains the missing actual template after the next bonus level is reached without promising a template ETA', async () => {
  const state = newGym(at, 31);
  const template = templateRules.find(item => item.tier === 'starter')!;
  Object.assign(state.player!, {level: 15, peakLevel: 15, templateId: template.id, height: template.height[0], stats: {...template.stats}});
  await mount(TrainingAdvicePanel, state);
  const advice = document.querySelector('.gm-training-advice')!;
  expect(advice.textContent).toContain('当前培养奖金 +3 券');
  expect(advice.textContent).toContain('下一档：Lv.15＋全明星');
  expect(advice.textContent).toContain('等级已达标');
  expect(advice.textContent).toContain('模板仍需达到全明星');
  expect(advice.textContent).not.toContain('约 0秒 到 Lv.15');
  expect(actions).toEqual([]);
});

it('shows that a maxed athlete has no further attribute or training-bonus value without recommending automatically', async () => {
  const state = newGym(at, 31);
  const template = templateRules.find(item => item.tier === 'legend')!;
  Object.assign(state.player!, {level: 25, peakLevel: 25, templateId: template.id, height: template.height[0]});
  state.player!.stats = {three: 99, mid: 99, drive: 99, inside: 99, handle: 99, defense: 99};
  await mount(TrainingAdvicePanel, state);
  const advice = document.querySelector('.gm-training-advice')!;
  expect(advice.textContent).toContain('已达到最高培养奖金');
  expect(advice.textContent).toContain('继续训练不会增加属性');
  expect(advice.textContent).toContain('无需每名球员都练到99级');
  expect(advice.textContent).not.toContain('预计约');
  expect(latest.player).not.toBeNull();
  expect(actions).toEqual([]);
});

it('does not label a level-99 starter as having reached the highest training bonus', async () => {
  const state = newGym(at, 31);
  const template = templateRules.find(item => item.tier === 'starter')!;
  Object.assign(state.player!, {level: 99, peakLevel: 99, templateId: template.id, height: template.height[0], stats: {...template.stats}});
  await mount(TrainingAdvicePanel, state);
  const advice = document.querySelector('.gm-training-advice')!;
  expect(advice.textContent).toContain('按当前实际模板结算培养奖金 3 券');
  expect(advice.textContent).toContain('无法继续训练提升');
  expect(advice.textContent).not.toContain('已达到最高培养奖金');
  expect(advice.textContent).not.toContain('下一档');
  expect(actions).toEqual([]);
});
