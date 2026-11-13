import {afterEach, beforeEach, expect, it} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {useState, type ComponentType} from 'react';
import {act} from 'preact/test-utils';
import {cooperationOffers, newGym, dispatchGym, staminaMax, type GymAction, type GymState} from '../../src/game/gym/engine';
import {equipmentCatalog, equipmentFamilyLabels, type EquipmentEffects} from '../../src/game/gym/catalog';
import {templateRules} from '../../src/game/contract/templates';
import {ComicDialog} from '../../src/components/ComicDialog';
import {productImagePath} from '../../src/components/ProductImage';
import {GymClubPanel, GymCollectionPanel, GymCooperationPanel, GymInventoryPanel, GymOfflineReport, GymRecommendPanel, GymShopPanel, type GymPanelProps} from '../../src/components/GymPanels';
import {offlineLimitMs, type OfflineTrainingReport} from '../../src/game/gym/offline';

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

async function mount(Panel: ComponentType<GymPanelProps>, initial: GymState) {
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
    return <ComicDialog title="经营面板" onClose={() => {}}><Panel state={state} onAction={onAction} onClose={() => {}}/></ComicDialog>;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<Scene/>));
}

function buttonWithin(scope: ParentNode, text: string) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(text));
  expect(button, text).toBeTruthy();
  return button!;
}

function product(name: string) {
  const card = [...document.querySelectorAll<HTMLElement>('.gm-product')].find(item => item.querySelector('h4')?.textContent === name);
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

function own(state: GymState, installed: string[], warehouse: string[] = []) {
  state.ownedEquipment = [...installed, ...warehouse];
  state.equippedEquipment = [...installed];
  state.collectedEquipment = Object.fromEntries(state.ownedEquipment.map(id => [id, {firstAt: at}]));
  state.purchasePrices = Object.fromEntries(state.ownedEquipment.map(id => [id, equipmentCatalog.find(item => item.id === id)!.price]));
}

async function chooseReplacement(id: string) {
  await act(async () => {
    const select = document.querySelector<HTMLSelectElement>('[aria-label="选择替换的器材"]')!;
    select.value = id;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
}

async function filterShop(label: string, value: string) {
  await act(async () => {
    const field = [...document.querySelectorAll('.gm-filters > label')].find(item => item.firstChild?.textContent === label)!;
    const select = field.querySelector('select')!;
    select.value = value;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
}

it('buys a permanent item directly into the gym without refilling stamina or a second activation', async () => {
  const state = newGym(at, 11);
  const item = equipmentFor('stamina');
  const itemPrice = item.price;
  state.credits = itemPrice + 1;
  state.player!.stamina = 15;
  await mount(GymShopPanel, state);
  expect(document.querySelectorAll('.gm-product')).toHaveLength(35);
  for (const original of equipmentCatalog) {
    const image = product(original.name).querySelector('img')!;
    expect(image.getAttribute('src')).toBe(productImagePath(original.artId));
    expect(image.getAttribute('alt')).toBe(`${original.name}商品图`);
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
  expect(product(item.name).textContent).toContain('馆内生效');
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
  expect(document.querySelector('.gm-detail-art img')!.getAttribute('src')).toBe(productImagePath(warehouse.artId));
  expect(document.querySelector('.gm-detail-art h3')!.textContent).toBe(warehouse.name);
  expect(actions).toEqual([]);
  await act(async () => root!.unmount()); root = null;
  await mount(GymCollectionPanel, state);
  await press(buttonWithin(document, '器材图鉴'));
  for (const item of [installed, warehouse]) {
    const card = [...document.querySelectorAll<HTMLButtonElement>('.gm-album-card')].find(card => card.querySelector('strong')?.textContent === item.name)!;
    expect(card.querySelector('img')!.getAttribute('src')).toBe(productImagePath(item.artId));
  }
  const collected = [...document.querySelectorAll<HTMLButtonElement>('.gm-album-card')].find(card => card.querySelector('strong')?.textContent === installed.name)!;
  await press(collected);
  expect(document.querySelector('.gm-detail-art img')!.getAttribute('src')).toBe(productImagePath(installed.artId));
  expect(document.querySelector('.gm-detail-art h3')!.textContent).toBe(installed.name);
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
  await press(buttonWithin(product(incoming.name), '替换馆内器材'));
  expect(buttonWithin(document, '确认替换').disabled).toBe(true);
  await press(buttonWithin(document, '取消替换'));
  expect(actions).toEqual([]);
  expect(latest.equippedEquipment).toEqual(state.equippedEquipment);
  await press(buttonWithin(product(incoming.name), '替换馆内器材'));
  await chooseReplacement(installed[0].id);
  await press(buttonWithin(document, '确认替换'));
  expect(latest.equippedEquipment).toHaveLength(4);
  expect(latest.equippedEquipment).toContain(incoming.id);
  expect(latest.equippedEquipment).not.toContain(installed[0].id);
  expect(latest.ownedEquipment).toHaveLength(5);
  expect(latest.collectedEquipment[installed[0].id]).toBeTruthy();
  expect(actionError).toBeUndefined();
});

it('buys into a full gym only after selecting a replacement and refunds a warehouse sale once', async () => {
  const state = newGym(at, 11);
  state.credits = 30;
  const installed = ['stamina', 'recovery', 'courseRecovery', 'valuePercent'].map(effect => equipmentFor(effect as keyof EquipmentEffects));
  const incoming = equipmentFor('experience');
  const outgoing = installed[0];
  own(state, installed.map(item => item.id));
  await mount(GymShopPanel, state);
  await press(buttonWithin(product(incoming.name), '购买'));
  expect(latest.credits).toBe(30);
  expect(buttonWithin(document, '确认购买并替换').disabled).toBe(true);
  await press(buttonWithin(document, '取消替换'));
  expect(actions).toEqual([]);
  await press(buttonWithin(product(incoming.name), '购买'));
  await chooseReplacement(outgoing.id);
  await press(buttonWithin(document, '确认购买并替换'));
  expect(latest.equippedEquipment).toContain(incoming.id);
  expect(latest.equippedEquipment).not.toContain(outgoing.id);
  expect(latest.ownedEquipment).toContain(outgoing.id);
  const replaced = latest;
  const credits = replaced.credits;
  act(() => root!.unmount()); root = null;
  await mount(GymInventoryPanel, replaced);
  expect(product(outgoing.name).textContent).toContain('仓库器材');
  await press(buttonWithin(product(outgoing.name), '半价出售'));
  expect(document.body.textContent).toContain('图鉴保留');
  await press(buttonWithin(document, '保留器材'));
  expect(latest.credits).toBe(credits);
  await press(buttonWithin(product(outgoing.name), '半价出售'));
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
  const preview = document.querySelector('.gm-replace-label')!.parentElement!.textContent!;
  expect(preview).toContain('恢复间隔 19 → 20 秒/点（恢复变慢）');
  expect(preview).toContain('推荐按实际培养期间的平均品牌加成结算');
  expect(preview).not.toContain('当前培养声望');
  expect(latest.credits).toBe(30);
  expect(actions).toEqual([]);
  await press(buttonWithin(document, '取消替换'));
  expect(latest.equippedEquipment).toContain(recovery.id);
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
  expect(product(advanced.name).textContent).toContain('体力上限 24 → 30');
  await press(buttonWithin(product(advanced.name), '购买'));
  const select = document.querySelector<HTMLSelectElement>('[aria-label="选择替换的器材"]')!;
  expect(select.value).toBe(basic.id);
  expect([...select.options].map(option => option.value)).toEqual([basic.id]);
  expect(document.querySelector('.gm-replace-label')!.parentElement!.textContent).toContain('同类只启用一件');
  expect(buttonWithin(document, '确认购买并替换').disabled).toBe(false);
  expect(actions).toEqual([]);
  await press(buttonWithin(document, '取消替换'));
  expect(latest.equippedEquipment).toEqual([basic.id]);
  expect(latest.credits).toBe(30);
  await press(buttonWithin(product(advanced.name), '购买'));
  await press(buttonWithin(document, '确认购买并替换'));
  expect(actions).toEqual([{type: 'buy-equipment', id: advanced.id, replaceId: basic.id}]);
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
  await press(buttonWithin(product(advanced.name), '替换馆内器材'));
  const select = document.querySelector<HTMLSelectElement>('[aria-label="选择替换的器材"]')!;
  expect(select.value).toBe(basic.id);
  expect([...select.options].map(option => option.value)).toEqual([basic.id]);
  await press(buttonWithin(document, '确认替换'));
  expect(latest.equippedEquipment).toEqual([...other.map(item => item.id), advanced.id]);
  expect(latest.ownedEquipment).toContain(basic.id);
  expect(actions).toEqual([{type: 'equip', id: advanced.id, replaceId: basic.id}]);
  expect(actionError).toBeUndefined();
});

it('filters and previews general experience, automatic experience and offline duration independently', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 6;
  await mount(GymShopPanel, state);
  await filterShop('效果', 'experience');
  expect(document.querySelectorAll('.gm-product')).toHaveLength(3);
  expect(product(equipmentFor('experience', 3).name).textContent).toContain('每球器材经验 +0 → +3');
  expect(document.body.textContent).toContain('手动、在线自动与离线均生效');
  await filterShop('效果', 'automationExperience');
  expect(document.querySelectorAll('.gm-product')).toHaveLength(3);
  expect(product(equipmentFor('automationExperience', 3).name).textContent).toContain('自动每球额外经验 +0 → +3');
  expect(document.body.textContent).toContain('在线自动与离线加成相同');
  await filterShop('效果', 'offlineMinutes');
  expect(document.querySelectorAll('.gm-product')).toHaveLength(3);
  expect(product(equipmentFor('offlineMinutes', 3).name).textContent).toContain('每次离线训练上限 30分钟 → 1小时30分钟');
  expect(actions).toEqual([]);
});

it('filters a complete specialty family and shows its grade in the existing card and detail styles', async () => {
  await mount(GymShopPanel, newGym(at, 11));
  await filterShop('类别', 'focus-defense');
  const entries = equipmentCatalog.filter(item => item.family === 'focus-defense');
  expect(document.querySelectorAll('.gm-product')).toHaveLength(2);
  for (const item of entries) {
    expect(product(item.name).querySelector('.gm-product-meta')!.textContent).toContain(`${equipmentFamilyLabels[item.family]} · ${item.grade}阶`);
    expect(product(item.name).dataset.family).toBe(item.family);
    expect(buttonWithin(product(item.name), '购买').className).toBe('gm-button gm-primary');
  }
  await press(buttonWithin(product(entries[1].name), '器材详情'));
  const detail = document.querySelector('.gm-detail-dialog')!;
  expect(detail.textContent).toContain('防守专项 · 同类只启用一件');
  expect(detail.textContent).toContain('3阶');
  expect(actions).toEqual([]);
});

it('previews offline-family replacement at the shared four-hour limit without summing both grades', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 8;
  state.projects.offline = 5;
  const basic = equipmentFor('offlineMinutes');
  const advanced = equipmentFor('offlineMinutes', 3);
  own(state, [basic.id]);
  await mount(GymShopPanel, state);
  expect(product(advanced.name).textContent).toContain('每次离线训练上限 3小时15分钟 → 4小时');
  expect(product(advanced.name).textContent).toContain(`将替换「${basic.name}」`);
  expect(actions).toEqual([]);
});

it('keeps archived equipment collection counts separate from the current thirty-five items', async () => {
  const state = newGym(at, 11);
  state.legacyEquipmentCollection = {relic_005: {firstAt: at}, relic_009: {firstAt: at}};
  state.collectedEquipment[equipmentFor('stamina').id] = {firstAt: at};
  await mount(GymCollectionPanel, state);
  await press(buttonWithin(document, '器材图鉴'));
  expect(document.querySelector('.gm-album-progress')!.textContent).toContain('1 / 35');
  expect(document.body.textContent).toContain('历史器材收藏 2 件已留档，不计入当前 35 件器材的收藏进度');
  expect(document.querySelectorAll('.gm-album-card')).toHaveLength(35);
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
  expect(progress.textContent).toContain('本档器材已完成 1/2 完整课程');
  expect(progress.textContent).toContain('当前课实际启用 3/10 球');
  expect(progress.textContent).toContain('需完整10球均启用才计一课');
  expect(progress.textContent).toContain('还差 1 整课取得额外 1 券训练资格');
  expect(progress.textContent).toContain('合作达标后推荐领取');
  if (complete) expect(progress.textContent).toContain('合作已达标');
  else {
    expect(progress.textContent).not.toContain('合作已达标');
    expect(document.querySelector('[role="status"]')!.textContent).not.toContain('推荐时额外获得');
  }
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
  expect(progress.textContent).toContain('本课已有未启用本档器材的投篮，本课不计完整课程');
  expect(progress.textContent).toContain('当前课实际启用 3/10 球');
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
  expect(progress.textContent).toContain('已保留额外 2 券训练资格，合作达标后推荐领取');
  expect(progress.textContent).toContain('换下器材不会丢失');
  expect(progress.textContent).not.toContain('本档器材已完成');
  expect(document.querySelector('[role="status"]')!.textContent).not.toContain('推荐时额外获得');
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
  expect(product('运动饮料').textContent).toContain('本次恢复 2 点');
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
  expect(automation.textContent).toContain('1.8 秒/球');
  expect(automation.textContent).toContain('每球额外 +1 经验');
  await press(buttonWithin(automation, '升级'));
  expect(latest.projects.automation).toBe(1);
  expect(automation.textContent).toContain('1.8 秒/球');
  expect(latest.projects.offline).toBe(0);
  const offline = [...document.querySelectorAll<HTMLElement>('.gm-project')].find(card => card.querySelector('h4')?.textContent === '离线课表')!;
  expect(offline.textContent).toContain('30分钟');
  expect(offline.textContent).toContain('45分钟');
  await press(buttonWithin(offline, '升级'));
  expect(latest.projects.offline).toBe(1);
  expect(offlineLimitMs(latest)).toBe(2_700_000);
  expect(offline.textContent).toContain('预计约');
  expect(offline.textContent).toContain('模板、奖金节点提前推荐');
  expect(actionError).toBeUndefined();
});

it('explains the shared level-two unlock and prevents offline-cap purchases at level one', async () => {
  const state = newGym(at, 11);
  state.credits = 100;
  await mount(GymClubPanel, state);
  const offline = [...document.querySelectorAll<HTMLElement>('.gm-project')].find(card => card.querySelector('h4')?.textContent === '离线课表')!;
  expect(offline.textContent).toContain('Lv.2');
  expect(buttonWithin(offline, '暂不可升级').disabled).toBe(true);
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
  expect(dialog.textContent).toContain('Lv.0 → Lv.8');
  expect(dialog.textContent).toContain('超出部分仅恢复体力');
  expect(dialog.textContent).toContain('已自动保存');
  expect(dialog.textContent).toContain('不会自动推荐或招募');
  expect(dialog.textContent).not.toContain('领取');
  await press(buttonWithin(dialog, '继续培养'));
  expect(closed).toBe(1);
});

it.each([false, true])('confirms the displayed recommendation reward and archives the athlete (legend %s)', async legendary => {
  const state = newGym(at, 11);
  if (legendary) {
    const template = templateRules.find(item => item.tier === 'legend')!;
    state.player!.templateId = template.id;
    state.player!.height = template.height[0];
    state.player!.stats = {...template.stats};
    state.player!.level = 18;
    state.player!.peakLevel = 18;
    state.player!.highestTier = 'legend';
  }
  const id = state.player!.id;
  await mount(GymRecommendPanel, state);
  const confirm = buttonWithin(document, '确认推荐');
  expect(confirm.textContent).toContain(legendary ? '+12 券' : '+0 券');
  expect(document.querySelector('.gym-panel')!.textContent).not.toMatch(/交付|经费|信用/);
  await press(confirm);
  expect(latest.player).toBeNull();
  expect(latest.credits).toBe(legendary ? 12 : 0);
  expect(latest.alumni).toHaveLength(1);
  expect(latest.alumni[0].id).toBe(id);
  expect(latest.alumni[0].rewardCredits).toBe(legendary ? 12 : 0);
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
  expect(document.querySelector('.gm-album-progress')!.textContent).toContain('1 / 119');
  expect(document.querySelectorAll('.gm-album-card:not(.is-unknown)')).toHaveLength(1);
  await press(buttonWithin(document, '器材图鉴'));
  expect(document.querySelector('.gm-album-progress')!.textContent).toContain('1 / 35');
  const collected = document.querySelector<HTMLButtonElement>('.gm-album-card:not(.is-unknown)')!;
  expect(collected.textContent).toContain(item.name);
  expect(collected.textContent).toContain('已收藏');
  await press(collected);
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  expect(document.body.textContent).toContain(`体力上限 +${item.effects.stamina}`);
  expect(actions).toEqual([]);
});

it('explains the missing actual template after the next bonus level is reached without promising a template ETA', async () => {
  const state = newGym(at, 31);
  const template = templateRules.find(item => item.tier === 'starter')!;
  Object.assign(state.player!, {level: 15, peakLevel: 15, templateId: template.id, height: template.height[0], stats: {...template.stats}});
  await mount(GymRecommendPanel, state);
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
  await mount(GymRecommendPanel, state);
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
  await mount(GymRecommendPanel, state);
  const advice = document.querySelector('.gm-training-advice')!;
  expect(advice.textContent).toContain('按当前实际模板结算培养奖金 3 券');
  expect(advice.textContent).toContain('无法继续训练提升');
  expect(advice.textContent).not.toContain('已达到最高培养奖金');
  expect(advice.textContent).not.toContain('下一档');
  expect(actions).toEqual([]);
});
