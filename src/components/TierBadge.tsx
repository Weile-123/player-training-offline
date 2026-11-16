import {tierConfig} from '../game/matching';
import type {TemplateTier} from '../game/templates';
import './TierBadge.css';

/** The same small metal credential is used wherever a player tier is shown. */
export function TierBadge({tier, className = ''}: {tier?: TemplateTier | 'undiscovered' | null; className?: string}) {
  const current = tier ?? 'undiscovered';
  return <b className={`tier-badge${className ? ` ${className}` : ''}`} data-tier={current}>{current === 'undiscovered' ? '待发掘' : tierConfig(current).label}</b>;
}
