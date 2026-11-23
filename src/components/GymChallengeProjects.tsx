import {useState, type ComponentProps} from 'react';
import {
  challengeProjectEffect, challengeProjectOffer, challengeProjects, type ChallengeProjectId,
} from '../game/gym/challengeProjects';
import {ComicDialog} from './ComicDialog';
import {GameIcon} from './GameIcon';
import type {GymPanelProps} from './GymPanels';

const projectIcons: Record<ChallengeProjectId, ComponentProps<typeof GameIcon>['name']> = {
  scouting: 'people',
  conditioning: 'train',
  training: 'book',
  coaching: 'handoff',
  recruiting: 'handshake',
};

export function GymChallengeProjects({state, onAction, busy}: GymPanelProps) {
  const [detail, setDetail] = useState<ChallengeProjectId | null>(null);
  const selectedProject = challengeProjects.find(item => item.id === detail);
  const selectedOffer = selectedProject ? challengeProjectOffer(state, selectedProject.id) : null;

  return <div className="gm-stack gm-club-project-page gm-challenge-project-page">
    <div className="gm-section-heading"><h3>挑战项目</h3><small>新一轮挑战生效</small></div>
    <div className="gm-projects gm-project-list">{challengeProjects.map(project => {
      const offer = challengeProjectOffer(state, project.id);
      const baseLevel = project.id === 'scouting' ? 1 : 0;
      return <article key={project.id} data-challenge-project-id={project.id} className="gm-project gm-project-row">
        <span className="gm-project-badge"><GameIcon name={projectIcons[project.id]}/></span>
        <div className="gm-project-summary">
          <div className="gm-project-row-title"><h4>{project.name}</h4><small>Lv.{offer.level + baseLevel} / {project.prices.length + baseLevel}</small></div>
          <p className="gm-challenge-project-effect">{challengeProjectEffect(project.id, offer.level)}
            {offer.nextLevel !== null && <span>下级 · {challengeProjectEffect(project.id, offer.nextLevel)}</span>}
          </p>
        </div>
        <button type="button" className="gm-project-detail" aria-label={`查看${project.name}详情`} onClick={() => setDetail(project.id)}>?</button>
        <button type="button" className="gm-button gm-primary gm-project-upgrade" disabled={busy || !offer.canUpgrade}
          title={offer.reason ?? undefined} onClick={() => onAction({type: 'upgrade-challenge-project', projectId: project.id})}>
          {offer.price === null ? '已升满' : <>{offer.canUpgrade ? '升级' : ''}<b>{offer.price}券</b>{!offer.canUpgrade && <small>{offer.reason}</small>}</>}
        </button>
      </article>;
    })}</div>
    {selectedProject && selectedOffer && <ComicDialog title={`${selectedProject.name}详情`} onClose={() => setDetail(null)}>
      <div className="gym-panel gm-stack">
        <p>{selectedProject.description}</p>
        <p>当前 · {challengeProjectEffect(selectedProject.id, selectedOffer.level)}</p>
        {selectedOffer.nextLevel !== null && <p>下级 · {challengeProjectEffect(selectedProject.id, selectedOffer.nextLevel)}</p>}
        <button type="button" className="gm-button" onClick={() => setDetail(null)}>返回挑战项目</button>
      </div>
    </ComicDialog>}
  </div>;
}
