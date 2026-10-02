import { describe, expect, it, vi } from 'vitest';

import { embedViaGateway, type FleetGatewayBinding } from './embeddings';

describe('Starboard private Free AI embeddings', () => {
  it('keeps the BGE model, batch order, 768 coordinates, and gateway receiver', async () => {
    const calls: Array<{ project: string; model: string; input: unknown; receiver: unknown }> = [];
    const gateway: FleetGatewayBinding = {
      run(this: unknown, projectId, model, input) {
        calls.push({ project: projectId, model, input, receiver: this });
        const text = (input as { text: string[] }).text;
        return Promise.resolve({
          data: text.map((value) =>
            Array.from({ length: 768 }, () => Number(value.slice('repo-'.length)))
          ),
        });
      },
      fetch: vi.fn(),
    };
    const input = Array.from({ length: 55 }, (_, index) => `repo-${index}`);

    const vectors = await embedViaGateway(gateway, input);

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => (call.input as { text: string[] }).text.length)).toEqual([50, 5]);
    expect(calls.every((call) => !('pooling' in (call.input as object)))).toBe(true);
    expect(calls.every((call) => call.project === 'starboard')).toBe(true);
    expect(calls.every((call) => call.model === '@cf/baai/bge-base-en-v1.5')).toBe(true);
    expect(calls.every((call) => call.receiver === gateway)).toBe(true);
    expect(vectors).toHaveLength(55);
    expect(vectors[0]).toHaveLength(768);
    expect(vectors.at(-1)?.[0]).toBe(54);
  });

  it('preserves legacy dimension normalization for expanded native embeddings', async () => {
    const gateway: FleetGatewayBinding = {
      run: vi.fn(async () => ({ data: [Array.from({ length: 1536 }, (_, index) => index)] })),
      fetch: vi.fn(),
    };

    const [vector] = await embedViaGateway(gateway, ['repo']);

    expect(vector).toHaveLength(768);
    expect(vector[0]).toBe(0.5);
    expect(vector[1]).toBe(2.5);
  });

  it('rejects dimensions that do not preserve the legacy normalization contract', async () => {
    const gateway: FleetGatewayBinding = {
      run: vi.fn(async () => ({ data: [Array.from({ length: 1537 }, () => 1)] })),
      fetch: vi.fn(),
    };

    await expect(embedViaGateway(gateway, ['repo'])).rejects.toThrow(/768-dimension BGE contract/);
    expect(gateway.run).toHaveBeenCalledTimes(1);
  });
});
