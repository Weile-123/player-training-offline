import {rules} from '../game/contract/rules';

/** The cap is immediate; ordinary equipment notices still wait for shot animations. */
export function trainingNotice({player,dismissedId,blocked,equipmentCount,animationsPending=false}:{player?:{id:string;level:number};dismissedId:string|null;blocked:boolean;equipmentCount:number;animationsPending?:boolean}){
 if(blocked)return null;
 if(player&&player.level>=rules.trainingLevelCap&&dismissedId!==player.id)return 'cap';
 return equipmentCount>0&&!animationsPending?'equipment':null;
}
