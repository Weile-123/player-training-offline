import type {NbaTemplate, Position, TemplateTier} from './templates';
import {statKeys, type StatKey} from './types';

// Game-design profiles and adaptation ranges, not real-world measurements.
type Row = [string,string,string,TemplateTier,Position,number,number,number[],string];
const rows:Row[] = [
 ['shannon-brown','香农·布朗','Shannon Brown','rotation','SG',178,201,[65,50,88,86,55,45],'冲筐终结'],
 ['corey-maggette','科里·马盖蒂','Corey Maggette','starter','SF',185,210,[55,75,94,92,68,52],'强力冲筐'],
 ['monta-ellis','蒙塔·埃利斯','Monta Ellis','starter','SG',178,201,[62,88,96,70,88,48],'中投突击'],
 ['al-jefferson','艾尔·杰弗森','Al Jefferson','star','C',198,218,[10,92,42,97,44,68],'低位技术'],
 ['andre-miller','安德烈·米勒','Andre Miller','starter','PG',178,201,[25,86,68,80,96,64],'背身组织'],
 ['steve-francis','史蒂夫·弗朗西斯','Steve Francis','starter','PG',178,201,[60,70,97,83,96,58],'持球突击'],
 ['boris-diaw','鲍里斯·迪奥','Boris Diaw','starter','PF',193,213,[55,65,58,86,92,72],'锋线策应'],
 ['greg-monroe','格雷格·门罗','Greg Monroe','starter','C',203,218,[12,65,52,92,82,58],'低位策应'],
 ['lamar-odom','拉马尔·奥多姆','Lamar Odom','starter','PF',198,218,[65,67,91,82,94,72],'长人持球'],
 ['hedo-turkoglu','希度·特科格鲁','Hedo Turkoglu','starter','SF',198,218,[84,91,74,64,94,56],'高位组织'],
 ['toni-kukoc','托尼·库科奇','Toni Kukoc','starter','SF',198,218,[91,90,72,75,92,57],'高个投射组织'],
 ['rashard-lewis','拉沙德·刘易斯','Rashard Lewis','starter','PF',198,218,[94,77,75,90,52,55],'空间终结'],
 ['michael-beasley','迈克尔·比斯利','Michael Beasley','starter','PF',193,218,[60,94,95,84,66,48],'高个单打'],
 ['amare-stoudemire','阿玛雷·斯塔德迈尔','Amare Stoudemire','star','C',198,218,[15,84,97,99,56,64],'长人冲筐'],
 ['joakim-noah','乔金·诺阿','Joakim Noah','star','C',200,218,[10,32,53,80,88,98],'防守策应'],
 ['porzingis','克里斯塔普斯·波尔津吉斯','Kristaps Porzingis','star','C',208,218,[89,88,49,91,37,97],'投射护筐'],
 ['gallinari','达尼罗·加里纳利','Danilo Gallinari','starter','SF',198,218,[92,82,89,77,72,52],'高个持球投射'],
 ['jonathan-isaac','乔纳森·艾萨克','Jonathan Isaac','starter','PF',200,218,[55,52,86,76,48,96],'机动锁防'],
 ['eric-gordon','埃里克·戈登','Eric Gordon','starter','SG',178,201,[91,70,82,90,65,52],'投射终结'],
];
export const specialistTemplates:readonly NbaTemplate[]=rows.map(([id,name,englishName,tier,position,min,max,values,style])=>({id,name,englishName,tier,position,height:[min,max],stats:Object.fromEntries(statKeys.map((k,i)=>[k,values[i]])) as NbaTemplate['stats'],style}));

/** Alternative entry branches supplement (never replace) old three-core gates.
 * All branches are monotone: no upper limits on weak attributes or style cutoffs. */
export const specialistCores:Record<string,StatKey[][]>={
 'shannon-brown':[['drive','inside']], 'corey-maggette':[['drive','inside']],
 'monta-ellis':[['mid','drive']], 'al-jefferson':[['mid','inside']],
 'andre-miller':[['mid','handle'],['mid','inside']], 'steve-francis':[['drive','handle']],
 'boris-diaw':[['inside','handle']], 'greg-monroe':[['inside','handle']],
 'lamar-odom':[['drive','handle']], 'hedo-turkoglu':[['mid','handle']],
 'toni-kukoc':[['three','mid'],['three','handle']], 'rashard-lewis':[['three','inside']],
 'michael-beasley':[['mid','drive']], 'amare-stoudemire':[['drive','inside']],
 'joakim-noah':[['handle','defense']], 'porzingis':[['three','defense'],['mid','defense']],
 'gallinari':[['three','drive']], 'jonathan-isaac':[['drive','defense']],
 'eric-gordon':[['three','inside']],
 gordon:[['drive','inside']], derozan:[['mid','drive']], aldridge:[['mid','inside']],
 livingston:[['mid','handle']], 'derrick-rose':[['drive','handle']], jokic:[['inside','handle']],
 rondo:[['inside','handle']], 'ray-allen':[['three','mid']], 'reggie-miller':[['three','mid']],
 'pau-gasol':[['mid','inside']],
};

// Mature secondary styles: these high gates preserve ordinary early routes.
export const matureSpecialistCores:Record<string,StatKey[][]>={
 'seth-curry':[['three','mid']], 'jose-calderon':[['three','handle']],
 kemba:[['three','drive']], 'gilbert-arenas':[['three','drive']],
 beverley:[['three','defense']], caruso:[['three','defense']],
 jrue:[['mid','defense'],['drive','defense'],['inside','defense']],
 butler:[['mid','defense']], 'shawn-marion':[['inside','defense']],
 capela:[['inside','defense']], rubio:[['handle','defense']], draymond:[['handle','defense']],
};
