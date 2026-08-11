import { describe, expect, it } from 'vitest';
import {
  buildDawnOpinionListReply,
  isDawnOpinionListAsk,
  isDawnOpinionMenuPending,
  parseDawnOpinionSelection,
} from '@/lib/query/dawn-opinion';

describe('dawn opinion list/pick', () => {
  it('detects Opinion-section asks, not bare dawn news', () => {
    expect(isDawnOpinionListAsk('dawn opinion section')).toBe(true);
    expect(isDawnOpinionListAsk('dawn opinions')).toBe(true);
    expect(isDawnOpinionListAsk('list dawn opinion pieces')).toBe(true);
    expect(isDawnOpinionListAsk('dawn news today')).toBe(false);
    expect(isDawnOpinionListAsk('bbc news today')).toBe(false);
  });

  it('menu pending from intent or list prompt text', () => {
    expect(
      isDawnOpinionMenuPending({ memoryIntent: 'dawn_opinion_list' }),
    ).toBe(true);
    expect(
      isDawnOpinionMenuPending({
        lastAnswer: 'Reply with a number (e.g. 2) or the title',
      }),
    ).toBe(true);
    expect(isDawnOpinionMenuPending({ memoryIntent: 'news' })).toBe(false);
  });

  it('parses number and title selections; rejects outlet switches', () => {
    const items = [
      { title: 'The task force test' },
      { title: 'Holy grail of economics' },
      { title: 'Our debt to children' },
    ];
    expect(parseDawnOpinionSelection('2', items)).toBe(1);
    expect(parseDawnOpinionSelection('read 3', items)).toBe(2);
    expect(parseDawnOpinionSelection('holy grail', items)).toBe(1);
    expect(parseDawnOpinionSelection('the second one', items)).toBe(1);
    expect(parseDawnOpinionSelection('second opinion piece', items)).toBe(1);
    expect(parseDawnOpinionSelection('tell me about the 2nd', items)).toBe(1);
    expect(parseDawnOpinionSelection('bbc news today', items)).toBeNull();
    expect(parseDawnOpinionSelection('99', items)).toBeNull();
  });

  it('list reply includes numbered titles and pick prompt', () => {
    const text = buildDawnOpinionListReply(
      [
        { title: 'The task force test', url: 'https://www.dawn.com/a', source: 'Dawn' },
        { title: 'Holy grail of economics', url: 'https://www.dawn.com/b', source: 'Dawn' },
      ],
      'en',
      (item, idx) => `• [${idx + 1}. ${item.title}](${item.url}) · Dawn`,
    );
    expect(text).toContain('1. The task force test');
    expect(text).toContain('2. Holy grail of economics');
    expect(text).toMatch(/Reply with a number/i);
    expect(text).not.toMatch(/According to/i);
  });
});
