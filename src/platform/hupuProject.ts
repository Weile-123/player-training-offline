import activity from '../../hupu-skills/activity.json';

/** Public identity only. Never import hupu-skills/credentials.json into the client. */
export const hupuProject = Object.freeze({applicationId: activity.activityId, name: activity.activityName});
export function assertHupuProject() {
 if (typeof window === 'undefined') return;
 const configured = window.__COLORBOX_AI_CONFIG__?.projectId;
 if (configured && configured !== hupuProject.applicationId) throw Error('虎扑活动配置与本项目不一致，请从传奇球馆活动页重新打开');
 // Preserve host-provided transport/configuration; only fill this project's public identity.
 if (!configured) window.__COLORBOX_AI_CONFIG__ = {...window.__COLORBOX_AI_CONFIG__, projectId: hupuProject.applicationId};
}
declare global {interface Window {__COLORBOX_AI_CONFIG__?: {projectId?: string; [key: string]: unknown}}}
