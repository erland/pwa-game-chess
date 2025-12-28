import { describe, expect, it } from '@jest/globals';
import { getLessonBlocks } from '../domain/training/lessons';
import type { LessonItem } from '../domain/training/schema';

describe('getLessonBlocks', () => {
  it('wraps legacy markdown into a markdown block', () => {
    const item: LessonItem = {
      type: 'lesson',
      itemId: 'x',
      difficulty: 1,
      themes: [],
      position: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' },
      markdown: '# Hello\nWorld'
    };
    const blocks = getLessonBlocks(item);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('markdown');
  });

  it('returns structured blocks when present', () => {
    const item: LessonItem = {
      type: 'lesson',
      itemId: 'y',
      difficulty: 1,
      themes: [],
      position: { fen: '8/8/8/8/8/8/8/8 w - - 0 1' },
      blocks: [{ kind: 'diagram', fen: '8/8/8/8/8/8/8/8 w - - 0 1' }]
    };
    const blocks = getLessonBlocks(item);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('diagram');
  });
});
