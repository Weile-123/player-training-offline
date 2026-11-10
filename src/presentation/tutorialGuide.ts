import {previewSettlement} from '../game/contract/engine';
import {money} from './money';
import type {TutorialState,TutorialStep} from './tutorial';

type Guide={selector:string;chapter:string;title:string;description:string;next?:string;action?:boolean};
export function tutorialGuide(lesson:TutorialState):Guide{
 const summary=previewSettlement(lesson.game);
 const guides:Record<Exclude<TutorialStep,'intro'|'complete'>,Guide>={
  train:{selector:'.contract-game .dock-shoot',chapter:'1 / 3 · 亲手训练',title:'点击「投篮」，训练这名球员',description:'本次练习会成功。先看完投篮动画，再观察上方球员面板的属性、等级和价值变化。正式游戏按概率条显示的概率结算，也可能受伤。',action:true},
  flight:{selector:'.game-stage',chapter:'1 / 3 · 观察投篮',title:'先看完这次投篮',description:'篮球落下后，会带你查看训练前后的属性变化。'},
  growth:{selector:'.game-player',chapter:'1 / 3 · 看见成长',title:'看上方球员面板：训练带来了什么？',description:'对比下面的训练前后数据：六维属性提高了，等级和球员价值也随之上涨。达到条件时还会匹配球星模板。',next:'接下来，查看本月最低交付指标'},
  goal:{selector:'.delivery-scoreboard .score-target',chapter:'2 / 3 · 认识交付指标',title:`本月最少交付 ${money(summary.required)}`,description:`这里的「指标」是本月最低交付总价值，必须达到或超过 ${money(summary.required)} 才算本月达标。交付的是球员，顶部经费不能抵扣；仅仅把球员练强，还需要将他加入交付名单。`,next:'知道指标了，学习加入交付'},
  deliver:{selector:'.contract-game .sell-shortcut',chapter:'2 / 3 · 加入交付',title:'点击「加入交付」',description:'按钮左侧是这名球员的当前价值，已足够达到首月指标。点击将他加入交付名单，再看上方「当前交付价值」的变化。',action:true},
  queued:{selector:'.delivery-scoreboard',chapter:'2 / 3 · 核对达标',title:'当前交付价值已达到最低指标',description:`当前交付 ${money(summary.value)} ≥ 本月指标 ${money(summary.required)}，本月已达标。名单还未正式交付；可以在「球员」→「待交付」撤回，未加入名单的球员会跨月保留。`,next:'已达标，学习结束本月'},
  month:{selector:'.contract-game .dock-month',chapter:'3 / 3 · 完成交付',title:'点击「结束本月」',description:'月份由你主动结束。先确认交付名单达标，再进行结算；未达标仍结算会扣 1 颗信用爱心，信用归零则本局结束。',action:true},
  confirm:{selector:'.settlement-dialog .settlement-submit',chapter:'3 / 3 · 确认交付',title:'核对后，点击「确认交付」',description:'当前名单已达标，信用不会减少。确认后，交付的球员离营，其价值转为经营经费，接着进入下个月。',action:true},
  settled:{selector:'.game-topbar',chapter:'3 / 3 · 练习完成',title:'你已经完成一次月度交付！',description:'已进入练习第 2 月，交付经费到账、信用保留，并迎来 3 名新人。记住：训练提高价值，加入名单凑足指标，再结束本月。接下来领取首月赠礼，开始正式生涯。',next:'开始正式生涯'},
 };
 return guides[lesson.step as Exclude<TutorialStep,'intro'|'complete'>];
}
