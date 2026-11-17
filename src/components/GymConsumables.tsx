import type {GymAction, GymState} from '../game/gym/engine';

type Props = {state: GymState; onAction: (action: GymAction) => void; purchasing?: boolean; busy?: boolean};

/** Kept as a source-compatible boundary; this release does not expose stock UI. */
export function GymConsumables(_props: Props) { return null; }
