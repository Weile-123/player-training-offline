import {templateById} from '../game/templates';

type NamedPlayer = {templateId?: string | null; name?: string | null};
const generatedRecruitName = /^新秀\s*[0-9０-９零〇一二三四五六七八九十百千万两]+$/u;

/** Hide generated recruit labels while preserving genuine custom names in old saves. */
export function gymPlayerName(player: NamedPlayer): string {
  const template = templateById(player.templateId);
  if (template) return template.name;
  const name = player.name?.trim();
  return !name || generatedRecruitName.test(name) ? '待发掘球员' : name;
}
