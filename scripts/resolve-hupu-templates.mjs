// Development-only identity resolution. Never run league-wide queries in the H5.
import fs from 'node:fs/promises';
const host = 'https://games.mobileapi.hupu.com/3/8.2.62/basketballapi/';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function get(path, params) {
 const response = await fetch(host + path + '?' + new URLSearchParams(params), {signal: AbortSignal.timeout(15000)});
 const body = await response.json();
 const legacyRoster = path === 'teamPlayerList' && Array.isArray(body.result?.list) && !('errorCode' in body);
 if (!response.ok || (!body.success && body.status !== 200 && !legacyRoster)) throw Error(path + ' ' + JSON.stringify(body).slice(0,800));
 await pause(250);
 return body.result;
}
const cache = '.npm-cache/hupu-rosters.json';
let players;
try { players = JSON.parse(await fs.readFile(cache, 'utf8')); }
catch {
 const seasons = await get('switchableRankSeasonList', {clientId:'0',rankType:'NBA_PLAYER_RANK'});
 const season = seasons.seasonData.find(row => row.seasonType === 'REGULAR').season;
 const standings = await get('teamStandingList', {competitionLeagueType:'nba',competitionType:'nba',season,competitionStageType:'REGULAR'});
 const teams = [...new Map(Object.values(standings.rankTypeListMap).flat().map(team => [team.teamId,team])).values()];
 players = [];
 for (const team of teams) {
  const roster = await get('teamPlayerList', {teamId:team.teamId,leagueType:'nba',competitionType:'nba',competitionLeagueType:'nba'});
  players.push(...(roster.list || []));
  console.log(team.teamName || team.teamId, roster.list?.length || 0);
 }
 await fs.writeFile(cache, JSON.stringify(players, null, 2));
}
const normalize = value => String(value || '').normalize('NFKD').replace(/[^a-z0-9\u4e00-\u9fff]/gi,'').toLowerCase();
const basic = await fs.readFile('src/game/templates.ts','utf8');
const extra = await fs.readFile('src/game/extraTemplates.ts','utf8');
const templates = [...basic.matchAll(/id: '([^']+)'.*?name: '([^']+)'.*?englishName: (["'])(.*?)\3/g)].map(m => ({id:m[1],name:m[2],englishName:m[4]}));
templates.push(...[...extra.matchAll(/\['([^']+)','([^']+)',(?:'([^']+)'|"([^"]+)")/g)].map(m => ({id:m[1],name:m[2],englishName:m[3]||m[4]})));
const found = {}, missing=[];
for (const t of templates) {
 const candidates = players.filter(p => normalize(t.name).endsWith(normalize(p.player_name)));
 const unique = [...new Map(candidates.map(p=>[p.playerId,p])).values()];
 for (const candidate of unique) {
  const p = (await get('playerPageHeadInfo',{playerId:candidate.playerId,leagueType:'nba'})).player;
  if (normalize(p.eng_name)===normalize(t.englishName) || normalize(p.name)===normalize(t.name)) {
   found[t.id]={playerId:String(p.playerId),name:p.name,englishName:p.eng_name,avatar:p.big_photo||p.photo};break;
  }
 }
 if(!found[t.id]) missing.push(t);
}
await fs.writeFile('.npm-cache/hupu-identities-found.json',JSON.stringify(found,null,2));
await fs.writeFile('.npm-cache/hupu-identities-missing.json',JSON.stringify(missing,null,2));
console.log('Resolved',Object.keys(found).length,'Missing',missing.map(t=>t.id).join(','));
