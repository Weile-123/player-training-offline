import { create } from 'zustand';
import * as engine from './game/engine';
import type { StorageLike } from './game/save';
import { loadCareer, writeCareer } from './game/careerSave';
import type { AssetId, ConsumableId, Game } from './game/types';
import { observeCollection, updateCollection, type Collection, type CollectionAction } from './game/collection';
import { loadCollection, writeCollection } from './game/collectionSave';
let storage: StorageLike;
try { storage = window.localStorage; }
catch { storage = { getItem: () => { throw Error('unavailable'); }, setItem: () => { throw Error('unavailable'); } }; }
const loaded = loadCareer(storage);
type Store = {
 hasSave: boolean; continueGame: () => boolean; startNewGame: () => void;
 collection: Collection; newUnlocks: string[]; dismissUnlock: () => void;
 game: Game; saveMessage: string; select: (id: string) => void; train: () => void;
 sell: (id: string) => void; rest: (id: string) => void; nextMonth: () => void;
 repay: (amount: number) => void; restart: () => void; activateHot: () => void;
 buyEquipment: (id: string) => void; toggleEquipment: (id: string) => void;
 buyConsumable: (id: ConsumableId, quantity?: number) => void;
 useConsumable: (id: ConsumableId) => void; upgradeAsset: (id: AssetId) => void;
};
export const useGame = create<Store>((set, get) => {
 const apply = (game: Game, action: CollectionAction = 'observe') => {
  if (game === get().game) return;
  if(game.selectedId&&!game.activePlayer)game=engine.select(game,game.selectedId);
  game = engine.activateHot(game);
  const collection = updateCollection(get().collection, get().game, game, action);
  const unlocks = Object.keys(collection).filter(id => !get().collection[id]);
  const profileSaved = writeCollection(storage, collection), saved = writeCareer(storage, game);
  set({ game, hasSave: true, collection,
   newUnlocks: action === 'restart' ? [] : [...get().newUnlocks, ...unlocks],
   saveMessage: saved && profileSaved ? '已自动存档' : '存档写入失败，部分进度仅当前会话有效' });
 };
 const restored=loaded.save?.game??engine.newGame();
 const initial = engine.activateHot(restored.selectedId&&!restored.activePlayer?engine.select(restored,restored.selectedId):restored), profile = loadCollection(storage);
 const collection = loaded.save ? observeCollection(profile.collection, initial) : profile.collection;
 const profileSaved = writeCollection(storage, collection);
 return {
  game: initial, hasSave: !!loaded.save, collection, newUnlocks: [],
  continueGame: () => get().hasSave, startNewGame: () => apply(engine.newGame(), 'restart'),
  dismissUnlock: () => set({ newUnlocks: get().newUnlocks.slice(1) }),
  saveMessage: profileSaved ? [loaded.message, profile.message].filter(Boolean).join(' · ') : '存档写入失败，部分进度仅当前会话有效',
  select: id => apply(engine.select(get().game, id)), train: () => apply(engine.train(get().game), 'train'),
  sell: id => apply(engine.sell(get().game, id), 'sell'), rest: id => apply(engine.rest(get().game, id)),
  nextMonth: () => apply(engine.nextMonth(get().game), 'month'), repay: amount => apply(engine.repay(get().game, amount)),
  restart: () => apply(engine.newGame(), 'restart'), activateHot: () => apply(engine.activateHot(get().game)),
  buyEquipment: id => apply(engine.buyEquipment(get().game, id)), toggleEquipment: id => apply(engine.toggleEquipment(get().game, id)),
  buyConsumable: (id, quantity) => apply(engine.buyConsumable(get().game, id, quantity)),
  useConsumable: id => apply(engine.useConsumable(get().game, id)), upgradeAsset: id => apply(engine.upgradeAsset(get().game, id)),
 };
});
