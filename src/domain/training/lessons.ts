import type { LessonBlock, LessonItem } from './schema';

export function getLessonBlocks(item: LessonItem): LessonBlock[] {
  if (Array.isArray(item.blocks) && item.blocks.length > 0) return item.blocks;
  if (typeof item.markdown === 'string' && item.markdown.trim().length > 0) {
    return [{ kind: 'markdown', markdown: item.markdown }];
  }
  return [];
}
