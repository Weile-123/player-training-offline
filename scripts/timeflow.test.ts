import {createHmac} from 'node:crypto';
import {describe, expect, it, vi} from 'vitest';
import {createGymTimeflowProtocol, timeflowApplicationId} from '../server/timeflow.mjs';

const binding = {
  applicationId: 'app_847cdb589a', workspaceId: 'app_847cdb589a', environmentId: 'test',
  scopeType: 'gym', scopeId: 'gym-test-1', state: 'active',
};
const sampleReport = () => ({
  settlementId: 'settlement-1', realDuration: 60_000, effectiveDuration: 60_000,
  segments: [{from: 100_000, to: 160_000}], gains: {training: '1'}, losses: {}, capped: {},
  events: [], ruleVersions: {training: 1}, definitionVersion: 1, replayed: false, approximated: false,
});

function fixture(responses: unknown[] = [sampleReport(), {}], consume?: (...args: unknown[]) => unknown) {
  const requests: {method: string; path: string; headers: Record<string, string>; body?: string}[] = [];
  const order: string[] = [];
  const transport = {send: vi.fn(async request => {
    requests.push(request);
    order.push(request.path.endsWith('/ack') ? 'ack' : 'fetch');
    const data = responses.shift();
    if (data instanceof Error) throw data;
    return {status: 200, headers: {}, body: JSON.stringify({ok: true, data})};
  })};
  const applyOnce = vi.fn(async (...args) => {order.push('commit'); return consume ? consume(...args) : 'applied';});
  let attempts = 0;
  const options = {token: 'unit-test-secret', scope: binding, applyOnce, transport,
    now: () => 1793260800000, requestIdFactory: () => `trace-${++attempts}`};
  return {client: createGymTimeflowProtocol(options), requests, applyOnce, transport, options, order};
}

describe('project Timeflow server adapter', () => {
  it('loads this project identity and uses the bundled SDK signed public protocol', async () => {
    const test = fixture();
    expect(timeflowApplicationId).toBe('app_847cdb589a');
    const result = await test.client.settle({requestId: 'stable-request-1'});
    expect(result.status).toBe('applied');
    expect(test.order).toEqual(['fetch', 'commit', 'ack']);
    const request = test.requests[0];
    expect(request.path).toBe('/shaper/timeflow/v1/gym/gym-test-1/settlements');
    expect(JSON.parse(request.body!)).toEqual({trigger: 'foreground'});
    expect(request.headers['X-Shaper-Token']).toBe('unit-test-secret');
    expect(request.headers['X-Workspace-Id']).toBe('app_847cdb589a');
    expect(request.headers['X-Idempotency-Key']).toBe('stable-request-1');
    const canonical = ['POST', request.path, '1793260800000', 'stable-request-1', request.body].join('\n');
    expect(request.headers['X-Signature']).toBe(createHmac('sha256', 'unit-test-secret').update(canonical).digest('hex'));
    expect(test.requests[1].headers['X-Request-Id']).not.toBe(request.headers['X-Request-Id']);
    expect(test.requests[1].headers['X-Idempotency-Key']).toBe('settlement-1');
    expect(test.applyOnce).toHaveBeenCalledWith(binding, sampleReport());
  });

  it('rejects incomplete configuration before any upstream request', () => {
    const test = fixture();
    expect(() => createGymTimeflowProtocol({...test.options, token: ''})).toThrow('SHAPER_TOKEN');
    expect(() => createGymTimeflowProtocol({...test.options, applyOnce: undefined})).toThrow('atomic');
    for (const scope of [undefined, {...binding, applicationId: 'app_original'}, {...binding, workspaceId: 'other'},
      {...binding, state: 'closed'}, {...binding, environmentId: ''}, {...binding, scopeId: '../other'}]) {
      expect(() => createGymTimeflowProtocol({...test.options, scope})).toThrow();
    }
    expect(test.transport.send).not.toHaveBeenCalled();
  });

  it.each(['http://relay.hupu.com', 'https://relay.hupu.com/path', 'https://relay.hupu.com/?path=other',
    'https://user:password@relay.hupu.com', 'https://relay.hupu.com/#fragment'])('rejects invalid server origin %s', baseUrl => {
    const test = fixture();
    expect(() => createGymTimeflowProtocol({...test.options, baseUrl})).toThrow('HTTPS origin');
  });

  it('does not accept a caller-supplied settlement interval or upstream path', async () => {
    const test = fixture();
    await test.client.settle({requestId: 'stable-request-1', trigger: 'login', from: 0, to: 1e15,
      path: '/definitions', workspaceId: 'other', scopeId: 'other'});
    expect(JSON.parse(test.requests[0].body!)).toEqual({trigger: 'login'});
    expect(test.requests[0].path).toContain('/gym/gym-test-1/settlements');
  });

  it('treats an incomplete asynchronous result as pending without committing or ACK', async () => {
    const test = fixture([null]);
    expect(await test.client.resume({settlementId: 'settlement-1'})).toEqual({status: 'pending'});
    expect(test.applyOnce).not.toHaveBeenCalled();
    expect(test.requests).toHaveLength(1);
    expect(test.requests[0].method).toBe('GET');
  });

  it.each([null, {}, {...sampleReport(), gains: null}, {...sampleReport(), effectiveDuration: 60_001},
    {...sampleReport(), segments: [{from: 10, to: 9}]}, {...sampleReport(), approximated: undefined}])(
    'does not consume or ACK an incomplete report', async report => {
      const test = fixture([report]);
      await expect(test.client.settle({requestId: 'stable-request-1'})).rejects.toThrow();
      expect(test.applyOnce).not.toHaveBeenCalled();
      expect(test.requests).toHaveLength(1);
    },
  );

  it('rejects the wrong settlement report during resume', async () => {
    const test = fixture([{...sampleReport(), settlementId: 'other'}]);
    await expect(test.client.resume({settlementId: 'settlement-1'})).rejects.toThrow('Incomplete');
    expect(test.applyOnce).not.toHaveBeenCalled();
  });

  it('never ACKs a failed local transaction', async () => {
    const test = fixture([sampleReport()], () => {throw new Error('transaction failed');});
    await expect(test.client.settle({requestId: 'stable-request-1'})).rejects.toThrow('transaction failed');
    expect(test.requests).toHaveLength(1);
  });

  it('never ACKs a transaction without an explicit applied or replayed receipt', async () => {
    const test = fixture([sampleReport()], () => undefined);
    await expect(test.client.settle({requestId: 'stable-request-1'})).rejects.toThrow('not committed');
    expect(test.requests).toHaveLength(1);
  });

  it('resumes an ACK failure using the persisted settlement ID without applying twice', async () => {
    const applied = new Set<string>();
    let awards = 0;
    const test = fixture([sampleReport(), new Error('ACK interrupted'), sampleReport(), {}], (_scope, report: any) => {
      if (applied.has(report.settlementId)) return 'replayed';
      applied.add(report.settlementId);
      awards++;
      return 'applied';
    });
    await expect(test.client.settle({requestId: 'stable-request-1'})).rejects.toThrow();
    expect(test.requests).toHaveLength(2);
    const result = await test.client.resume({settlementId: 'settlement-1'});
    expect(result.replayed).toBe(true);
    expect(awards).toBe(1);
    expect(test.requests.map(request => request.path)).toEqual([
      '/shaper/timeflow/v1/gym/gym-test-1/settlements', '/shaper/timeflow/v1/settlements/settlement-1/ack',
      '/shaper/timeflow/v1/settlements/settlement-1', '/shaper/timeflow/v1/settlements/settlement-1/ack',
    ]);
  });

  it('does not automatically retry a network or protocol failure', async () => {
    const test = fixture([new Error('offline')]);
    await expect(test.client.settle({requestId: 'stable-request-1'})).rejects.toThrow();
    expect(test.requests).toHaveLength(1);
    expect(test.applyOnce).not.toHaveBeenCalled();
  });

  it('rejects unsupported triggers and path injection before transport', async () => {
    const test = fixture();
    await expect(test.client.settle({requestId: 'request-1', trigger: 'event'})).rejects.toThrow('Unsupported');
    await expect(test.client.settle({requestId: '../other'})).rejects.toThrow('Invalid');
    await expect(test.client.resume({settlementId: 'other?scope=1'})).rejects.toThrow('Invalid');
    expect(test.requests).toHaveLength(0);
  });
});
