import {mkdir, writeFile} from 'node:fs/promises';
import {newGym, equipmentCatalog, staminaMax, recoverySeconds, trainingStatus, automaticIntervalMs,
  experienceForLevel, type GymState} from '../src/game/gym/engine';
import {settleOfflineGym} from '../src/game/gym/offline';
import {validGym} from '../src/game/gym/save';

const start = 1_800_000_000_000;
function setup(high: boolean, automatic: number, seed: number): GymState {
  const state = {...newGym(start, seed), gymLevel: 8};
  state.projects.automation = automatic;
  if (high) {
    state.projects.endurance = 8;
    state.projects.recovery = 8;
    state.projects.equipment = 4;
    state.ownedEquipment = ['relic_085','relic_017','relic_075','relic_080','relic_090'];
    state.equippedEquipment = [...state.ownedEquipment];
    state.purchasePrices = Object.fromEntries(state.ownedEquipment.map(id => [id,equipmentCatalog.find(item=>item.id===id)!.price]));
    state.collectedEquipment = Object.fromEntries(state.ownedEquipment.map(id=>[id,{firstAt:start}]));
  }
  state.player!.stamina = staminaMax(state);
  state.player!.autoEnabled = true;
  state.player!.nextShotAt = start + automaticIntervalMs(state);
  if (!validGym(state)) throw new Error('Invalid efficiency fixture');
  return state;
}
const samples = [];
for (const high of [false,true]) for (let automatic=0;automatic<=5;automatic++) {
  const initial = setup(high,automatic,17);
  const halfHour = settleOfflineGym(initial,start+1_800_000).state;
  const p = halfHour.player!;
  samples.push({supply:high?'mature':'base',automaticLevel:automatic,intervalMs:automaticIntervalMs(initial),
    capacity:staminaMax(initial),recoverySeconds:recoverySeconds(initial),courseRecovery:trainingStatus(initial).recovery,
    halfHourShots:p.shots,halfHourExperience:experienceForLevel(p.level)+p.experience,halfHourLevel:p.level,
    expectedXpPerShot:11.6+automatic});
}
await mkdir('docs/balance',{recursive:true});
await writeFile('docs/balance/automatic-efficiency-v5.json',JSON.stringify({
  date:'2026-11-13',source:'actual-offline-training-engine',seed:17,
  note:'Preconfigured single-player supply fixtures, not from-zero acquisition; same RNG per comparison. No recommendation/income.',
  formula:'automatic XP per valid shot = base outcome XP + automatic project level; manual unchanged',samples,
},null,2)+'\n');
console.log(JSON.stringify(samples,null,2));
