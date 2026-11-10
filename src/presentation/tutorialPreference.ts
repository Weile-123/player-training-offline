const key='player-training.tutorial-enabled.v1';
export function tutorialEnabled():boolean{try{return localStorage.getItem(key)!=='false';}catch{return true;}}
export function saveTutorialEnabled(enabled:boolean):void{localStorage.setItem(key,String(enabled));}
