const enabledKey='legend-gym.tutorial-enabled.v1';
const completedKey='legend-gym.tutorial-completed.v1';
export function gymTutorialEnabled(){try{return localStorage.getItem(enabledKey)!=='false';}catch{return true;}}
export function saveGymTutorialEnabled(value:boolean){localStorage.setItem(enabledKey,String(value));}
export function gymTutorialCompleted(){try{return localStorage.getItem(completedKey)==='true';}catch{return false;}}
export function completeGymTutorial(){try{localStorage.setItem(completedKey,'true');}catch{/* Preferences cannot block entering a saved gym. */}}
export const shouldOfferGymTutorial=()=>!gymTutorialCompleted();
