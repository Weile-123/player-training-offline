import {decodeGym, encodeGym, validGym} from '../game/gym/save';
import type {GymAlumnus, GymPlayer, GymState} from '../game/gym/engine';
import {statKeys} from '../game/types';
import {loadAllGymAlumni} from '../presentation/gymAlumniGroups';
import type {GymStore} from '../gymStore';
import {hupuProject} from './hupuProject';

export type GymCloudArchive = {format: 'legend-gym-cloud-v1'; applicationId: string; uploadedAt: number; gym: string};
export type GymCloudProgress = {level: number; fame: number; shots: number; updatedAt: number; uploadedAt: number};
const failure = '这不是有效的传奇球馆云存档，本地进度已保留';
const pick = <T extends object>(source: T, keys: readonly (keyof T)[]) => Object.fromEntries(keys.filter(key => Object.prototype.hasOwnProperty.call(source,key)).map(key => [key,source[key]]));
function portablePlayer(player: GymPlayer): GymPlayer {
 const value = pick(player,['id','name','enteredAt','height','matchSeed','level','peakLevel','templateId','highestTier','shots','stamina','recoveryMs','enteredGymLevel','experience','nextShotAt','autoEnabled','greatShotReady','greatShotsRemaining','shareLevelClaimed']) as GymPlayer;
 for(const key of ['stats','entryStats','bias','lastStyle'] as const)value[key]=pick(player[key],statKeys) as GymPlayer[typeof key];
 value.book=Object.fromEntries(Object.entries(player.book).filter(([key])=>['base','greatBank','flat','permanent'].includes(key)).map(([key,fraction])=>[key,{n:fraction.n,d:fraction.d}])) as GymPlayer['book'];
 value.training={planId:player.training.planId,shots:player.training.shots,completedCourses:player.training.completedCourses};
 value.equipmentTraining={brandTotal:player.equipmentTraining.brandTotal,brandShots:player.equipmentTraining.brandShots,cooperationCourses:[...player.equipmentTraining.cooperationCourses],cooperationCourseShots:[...player.equipmentTraining.cooperationCourseShots]};
 value.cooperation=player.cooperation?pick(player.cooperation,['id','playerId','acceptedShots','acceptedCourses','acceptedRevision','adCompleted']) as GymPlayer['cooperation']:null;
 return value;
}
/** The archive contains durable game fields, never UI/store state or unknown extension properties. */
function portableGym(source: GymState): GymState {
 const value=pick(source,['kind','version','balanceVersion','seed','revision','createdAt','updatedAt','nextPlayer','credits','fame','gymLevel','equipmentCatalogVersion','offlineRulesVersion','collectionGoalId','recommendationRulesVersion','staminaRewardCount']) as GymState;
 value.player=source.player?portablePlayer(source.player):null;value.bench=source.bench.map(portablePlayer);
 value.alumni=source.alumni.map(player=>({...portablePlayer(player),recommendedAt:player.recommendedAt,rewardCredits:player.rewardCredits,rewardFame:player.rewardFame,finalValue:player.finalValue} as GymAlumnus));
 value.projects=pick(source.projects,['endurance','recovery','recruitment','equipment','automation','offline']) as GymState['projects'];
 value.inventory=pick(source.inventory,['drink','brace','timer','chalk','supplement']) as GymState['inventory'];
 value.ownedEquipment=[...source.ownedEquipment];value.equippedEquipment=[...source.equippedEquipment];value.purchasePrices=pick(source.purchasePrices,source.ownedEquipment) as GymState['purchasePrices'];
 value.collection=Object.fromEntries(Object.entries(source.collection).map(([id,item])=>[id,{firstAt:item.firstAt,highestRating:item.highestRating,highestValue:item.highestValue}]));
 value.collectedEquipment=Object.fromEntries(Object.entries(source.collectedEquipment).map(([id,item])=>[id,{firstAt:item.firstAt}]));
 if(source.legacyEquipmentCollection)value.legacyEquipmentCollection=Object.fromEntries(Object.entries(source.legacyEquipmentCollection).map(([id,item])=>[id,{firstAt:item.firstAt}]));
 if(source.postgameRecommendedTemplates)value.postgameRecommendedTemplates=[...source.postgameRecommendedTemplates];
 value.rng={recruits:{state:source.rng.recruits.state},economy:{state:source.rng.economy.state},attributes:{state:source.rng.attributes.state}};
 if(source.pendingLegacyEquipmentEffects)value.pendingLegacyEquipmentEffects={...pick(source.pendingLegacyEquipmentEffects,['stamina','recovery','valuePercent','courseRecovery','cooperationBonus','experience','automationExperience','offlineMinutes']),focus:pick(source.pendingLegacyEquipmentEffects.focus,statKeys)} as GymState['pendingLegacyEquipmentEffects'];
 return value;
}
export function parseGymCloudArchive(raw: string) {
 try {
  if (new TextEncoder().encode(raw).byteLength > 2 * 1024 * 1024) throw Error();
  const archive: GymCloudArchive = JSON.parse(raw);
  if (archive?.format !== 'legend-gym-cloud-v1' || archive.applicationId !== hupuProject.applicationId || !Number.isSafeInteger(archive.uploadedAt) || archive.uploadedAt < 0 || typeof archive.gym !== 'string') throw Error();
  const state = decodeGym(archive.gym);
  // Cloud snapshots carry every alumni record, never a pointer to another device's IndexedDB.
  if (!state || state.alumniArchive?.count) throw Error();
  const portable=portableGym(state);if(!validGym(portable))throw Error();
  return {archive, state:portable};
 } catch {throw Error(failure);}
}
export function gymCloudProgress(raw: string): GymCloudProgress {
 const {archive, state} = parseGymCloudArchive(raw);
 return {level: state.gymLevel, fame: state.fame, shots: [state.player, ...state.bench, ...state.alumni].reduce((total, player) => total + (player?.shots ?? 0), 0), updatedAt: state.updatedAt, uploadedAt: archive.uploadedAt};
}
export async function exportGymCloudArchive(store: {getState: () => GymStore}, now = Date.now()): Promise<string> {
 await store.getState().flush();
 const before = store.getState(), key = `${before.state.createdAt}:${before.state.seed}:${before.state.revision}`;
 if (!before.hasSave) throw Error('请先开设球馆，再上传进度');
 if (before.actionError) throw Error(before.actionError);
 const alumni = await loadAllGymAlumni(before.loadAlumni);
 const live = store.getState().state;
 if (`${live.createdAt}:${live.seed}:${live.revision}` !== key) throw Error('球馆进度已变化，请重新上传');
 const state: GymState = portableGym({...live, alumni: [...alumni].reverse()});
 delete state.alumniArchive;
 if (!validGym(state)) throw Error('球馆快照校验失败，原进度已保留');
 const raw = JSON.stringify({format: 'legend-gym-cloud-v1', applicationId: hupuProject.applicationId, uploadedAt: now, gym: encodeGym(state)} satisfies GymCloudArchive);
 if (new TextEncoder().encode(raw).byteLength > 2 * 1024 * 1024) throw Error('球馆档案超过云端 2 MiB 限制，未上传或删减任何进度');
 return raw;
}
