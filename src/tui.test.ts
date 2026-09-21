import { describe, test, expect, mock } from 'bun:test';
import type { Plugin } from '@opencode/plugin/tui';
import type { SessionMessageInfo } from '@opencode/client';
import { createNamer, combineNames, namingContext, validateName, safeError, positive, type generateName } from './tui';

const user = (id: string, text: string): SessionMessageInfo => ({ type: 'user', id, text, time: { created: 1 } });
function fixture(generate: typeof generateName = async () => 'Fix checkout bug') {
  let sessionID = 'ses_one';
  let now = 100_000;
  const messages = [user('msg_one', 'fix the checkout bug')];
  const rename = mock(async (_name: string) => true);
  const log = mock((_record: Record<string, unknown>) => {});
  const dispose = mock(() => {});
  const generateMock = mock(generate);
  const ctx = {
    client: { message: { list: async () => ({ data: messages.filter(m => m.type === 'user') }) } },
    ui: { router: { current: () => ({ type: 'session', sessionID }) } },
    data: { session: {
      get: () => ({ location: { directory: '/project' } }),
      message: { list: () => messages },
    } },
  } as unknown as Plugin.Context;
  const config = { apiKey: 'test-key', model: 'test-model', cooldownMs: 300_000, timeoutMs: 20, instructions: '' };
  const namer = createNamer(ctx, { generate: generateMock, target: { rename, dispose }, log, now: () => now }, config);
  return { namer, messages, rename, log, generateMock, dispose, ctx,
    navigate: (id: string) => { sessionID = id; }, advance: (ms: number) => { now += ms; } };
}

describe('V2 terminal naming', () => {
  test('names on the first request, waits on cooldown, then uses the newest request', async () => {
    const f = fixture();
    await f.namer.tick();
    expect(f.rename).toHaveBeenCalledWith('Fix checkout bug');
    f.messages.push(user('msg_two', 'now add checkout tests'));
    await f.namer.tick();
    expect(f.generateMock).toHaveBeenCalledTimes(1);
    f.advance(300_000);
    await f.namer.tick();
    expect(f.generateMock).toHaveBeenCalledTimes(2);
    expect(f.generateMock.mock.calls[1][0].requests.at(-1)).toBe('now add checkout tests');
    await f.namer.tick();
    expect(f.generateMock).toHaveBeenCalledTimes(2);
    f.namer.dispose();
  });

  test('a slow result cannot rename a different session; concurrent ticks do not duplicate calls', async () => {
    let resolve!: (name: string) => void;
    const f = fixture(() => new Promise(r => { resolve = r; }));
    const run = f.namer.tick();
    await Promise.resolve();
    await f.namer.tick();
    f.navigate('ses_two');
    resolve('Checkout issue fix');
    await run;
    expect(f.generateMock).toHaveBeenCalledTimes(1);
    expect(f.rename).not.toHaveBeenCalled();
    f.navigate('ses_one');
    await f.namer.tick();
    expect(f.rename).toHaveBeenCalledWith('Checkout issue fix');
    f.namer.dispose();
  });

  test('fallback includes reason, redacts keys, and retries unchanged input after backoff', async () => {
    let failed = false;
    const f = fixture(async () => {
      if (!failed) { failed = true; throw new Error('429 key=test-key'); }
      return 'Checkout bug repair';
    });
    await f.namer.tick();
    expect(f.log.mock.calls[0][0]).toMatchObject({ source: 'fallback', reason: '429 key=[redacted]' });
    await f.namer.tick();
    expect(f.generateMock).toHaveBeenCalledTimes(1);
    f.advance(30_000);
    await f.namer.tick();
    expect(f.rename).toHaveBeenLastCalledWith('Checkout bug repair');
    f.namer.dispose();
  });

  test('timeout aborts the request and logs a useful reason', async () => {
    const f = fixture((_input, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    await f.namer.tick();
    expect(f.log.mock.calls[0][0]).toMatchObject({ source: 'fallback', reason: 'timeout' });
    f.namer.dispose();
  });

  test('unloading aborts and never renames or schedules fallback', async () => {
    let signal!: AbortSignal;
    const f = fixture((_input, options) => new Promise((_resolve, reject) => {
      signal = options.signal;
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const run = f.namer.tick();
    await Promise.resolve();
    f.namer.dispose();
    await run;
    expect(signal.aborted).toBe(true);
    expect(f.rename).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalled();
    expect(f.dispose).toHaveBeenCalledTimes(1);
    await f.namer.tick();
    expect(f.generateMock).toHaveBeenCalledTimes(1);
  });

  test('user requests survive tool traffic and are bounded independently', () => {
    const messages: SessionMessageInfo[] = [user('msg_one', 'fix login')];
    for (let i = 0; i < 100; i++) messages.push({
      type: 'assistant', id: `msg_${i}`, time: { created: i }, agent: 'build', model: { id: 'test', providerID: 'test' },
      content: [], snapshot: { files: [`/secret/project/file${i}.ts`] },
    });
    const result = namingContext(messages);
    expect(result.requests).toEqual(['fix login']);
    expect(result.activity).toHaveLength(10);
    expect(result.activity[0]).toBe('file:file90.ts');
  });

  test('resumed sessions recover user requests outside the cached transcript', async () => {
    const f = fixture();
    f.messages.length = 0;
    const list = mock(async () => ({ data: [user('msg_old', 'repair checkout integration')], cursor: {} }));
    f.ctx.client.message.list = list;
    await f.namer.tick();
    expect(list.mock.calls[0]).toBeDefined();
    expect(f.generateMock.mock.calls[0][0].requests).toEqual(['repair checkout integration']);
    f.advance(10_000);
    await f.namer.tick();
    expect(list).toHaveBeenCalledTimes(1);
    expect(f.generateMock).toHaveBeenCalledTimes(1);
    f.namer.dispose();
  });

  test('only names live terminal panes in the target tab, ordered by position', () => {
    const panes = [
      { id: 1, tab_id: 3, pane_x: 10 }, { id: 2, tab_id: 3, pane_x: 0 },
      { id: 3, tab_id: 9 }, { id: 4, tab_id: 3, is_plugin: true }, { id: 5, tab_id: 3, exited: true },
    ];
    expect(combineNames(panes, panes[0], id => `Task ${id}`)).toBe('Task 2 | Task 1');
  });

  test('validates model output and unsafe configuration', () => {
    expect(validateName('إصلاح تسجيل الدخول')).toBe('إصلاح تسجيل الدخول');
    expect(() => validateName('first\nsecond')).toThrow();
    expect(() => validateName('one | two')).toThrow();
    expect(() => validateName('one')).toThrow();
    expect(() => validateName('a'.repeat(60))).toThrow();
    expect(positive(-10, 2000)).toBe(2000);
    expect(positive(Infinity, 2000)).toBe(2000);
    expect(safeError('url?key=secret&alt=json')).not.toContain('secret');
  });
});
