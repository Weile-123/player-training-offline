const projectIds = ['scouting', 'conditioning', 'training', 'coaching', 'recruiting'] as const;
export type ChallengeProjectId = typeof projectIds[number];
export type ChallengeProjectLevels = Partial<Record<ChallengeProjectId, number>>;

export const challengeProjectUnlockLevel = 3;
export const challengeLevelStatGain = 5;
export const challengeRecruitQualityBoostPerLevel = 3;
export const challengeScoutingOdds = [
  {starter: 0, star: 0},
  {starter: 10, star: 0},
  {starter: 14, star: 6},
] as const;

type ChallengeProject = {
  id: ChallengeProjectId;
  name: string;
  prices: readonly number[];
  description: string;
};

const definitions: Record<ChallengeProjectId, Omit<ChallengeProject, 'id'>> = {
  scouting: {
    name: '开局球探',
    prices: [12, 26],
    description: '每名开局候选独立抽取档次。升至 Lv.2 有机会抽到首发，Lv.3 还可能抽到全明星。',
  },
  conditioning: {
    name: '对抗训练',
    prices: [12, 20, 32, 48, 70],
    description: '每升一级，挑战内所有己方球员的六项能力各加 1 点。',
  },
  training: {
    name: '专项研究',
    prices: [12, 20, 34, 54],
    description: '每升一级，「属性提升」奖励的固定加点提高 1 点，百分比加成照常叠加。',
  },
  coaching: {
    name: '挑战教练',
    prices: [16, 30, 48],
    description: '每升一级，挑战球员每升一级时六项能力各额外提高 1 点。校友推荐带来的初始等级也适用。',
  },
  recruiting: {
    name: '引援球探',
    prices: [14, 24, 38, 60],
    description: '每升一级，引援候选的高品质档次合计概率最多增加 3 个百分点。档次仍按关卡开放，并各有概率上限。',
  },
};

export const challengeProjects: readonly ChallengeProject[] = projectIds.map(id => ({id, ...definitions[id]}));

export function validChallengeProjectLevels(value: unknown): value is ChallengeProjectLevels {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([id, level]) => {
    const project = challengeProjects.find(item => item.id === id);
    return project !== undefined && Number.isInteger(level) && level >= 0 && level <= project.prices.length;
  });
}

export function challengeProjectLevel(levels: Readonly<ChallengeProjectLevels> | undefined, id: ChallengeProjectId): number {
  return levels?.[id] ?? 0;
}

export function challengeProjectOffer(state: {
  gymLevel: number;
  credits: number;
  challengeProjects?: Readonly<ChallengeProjectLevels>;
}, id: string) {
  const project = challengeProjects.find(item => item.id === id);
  const level = project ? challengeProjectLevel(state.challengeProjects, project.id) : 0;
  const price = project?.prices[level] ?? null;
  const nextLevel = price === null ? null : level + 1;
  let reason: string | null = null;
  if (!project) reason = '挑战项目不存在';
  else if (state.gymLevel < challengeProjectUnlockLevel) reason = `球馆达到 ${challengeProjectUnlockLevel} 级后开放`;
  else if (price === null) reason = '挑战项目已达到最高等级';
  else if (state.credits < price) reason = '赞助券不足';
  return {level, nextLevel, price, reason, canUpgrade: reason === null};
}

export function challengeProjectEffect(id: ChallengeProjectId, level: number): string {
  switch (id) {
    case 'scouting': {
      const odds = challengeScoutingOdds[level];
      return odds.star ? `首发 ${odds.starter}% · 全明星 ${odds.star}%` : odds.starter ? `首发 ${odds.starter}%` : '只抽取替补';
    }
    case 'conditioning': return `全员对抗六维 +${level}`;
    case 'training': return `属性奖励固定加点 +${level}`;
    case 'coaching': return `球员每升一级，六维各 +${challengeLevelStatGain + level}`;
    case 'recruiting': return `高品质概率提升最多 ${challengeRecruitQualityBoostPerLevel * level} 个百分点`;
  }
}
