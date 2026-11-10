import {expect,it} from 'vitest';
import {trainingNotice} from './trainingNotice';

it('prioritizes a newly capped player over pending equipment notices immediately',()=>{
 const context={player:{id:'p1',level:98},dismissedId:null,blocked:false,equipmentCount:2};
 expect(trainingNotice(context)).toBe('equipment');
 expect(trainingNotice({...context,animationsPending:true})).toBeNull();
 expect(trainingNotice({...context,player:{id:'p1',level:99}})).toBe('cap');
 expect(trainingNotice({...context,player:{id:'p1',level:99},animationsPending:true})).toBe('cap');
 // Dismissing the cap resumes the existing equipment queue without consuming it.
 expect(trainingNotice({...context,player:{id:'p1',level:99},dismissedId:'p1'})).toBe('equipment');
});
it('a different capped player gets their own notice and active dialogs remain protected',()=>{
 expect(trainingNotice({player:{id:'p2',level:99},dismissedId:'p1',blocked:false,equipmentCount:0})).toBe('cap');
 expect(trainingNotice({player:{id:'p2',level:99},dismissedId:'p1',blocked:true,equipmentCount:1})).toBeNull();
 expect(trainingNotice({player:undefined,dismissedId:null,blocked:false,equipmentCount:0})).toBeNull();
});
