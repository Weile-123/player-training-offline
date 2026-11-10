import {useState} from 'react';
import {advanceTutorial,createTutorial,skipTutorial,type TutorialStep} from '../presentation/tutorial';
import ContractGame from './ContractGame';
import {ComicDialog} from './ComicDialog';
import {TutorialWelcome} from './TutorialWelcome';

/** Runs practice data through the real game screen, without touching the saved career. */
export default function CareerTutorial({onComplete,onExit,error}:{onComplete:()=>void;onExit:()=>void;error:string}){
 const [lesson,setLesson]=useState(createTutorial);
 const advance=(action:TutorialStep)=>{
  const next=advanceTutorial(lesson,action);
  if(next!==lesson){setLesson(next);if(next.step==='complete')onComplete();}
  return next;
 };
 return <><ContractGame onHome={()=>{}} tutorial={{lesson,advance,skip:()=>{setLesson(skipTutorial(lesson));onComplete();}}}/>
  {lesson.step==='intro'&&<TutorialWelcome onStart={()=>advance('intro')}/>}
  {lesson.step==='complete'&&error&&<ComicDialog title="新生涯尚未创建" onClose={onExit}><p role="alert">{error}</p><button className="primary" onClick={onComplete}>重试创建生涯</button><button onClick={onExit}>返回首页</button></ComicDialog>}
 </>;
}
