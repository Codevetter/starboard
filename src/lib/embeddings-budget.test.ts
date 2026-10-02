import { describe, expect, it, vi } from 'vitest';

import { embedViaGateway, type FleetGatewayBinding } from './embeddings';

describe('Starboard centralized embedding admission', () => {
  it('makes one attributed gateway call per batch and leaves neuron reservation to the gateway', async () => {
    const calls: Array<{ project: string; model: string; input: unknown }> = [];
    const gateway: FleetGatewayBinding = {
      run: vi.fn(async (projectId, model, input) => {
        calls.push({ project: projectId, model, input });
        return {
          data: (input as { text: string[] }).text.map(() =>
            Array.from({ length: 768 }, () => 0.25)
          ),
        };
      }),
      fetch: vi.fn(),
    };

    await embedViaGateway(gateway, ['café']);

    expect(calls).toEqual([
      {
        project: 'starboard',
        model: '@cf/baai/bge-base-en-v1.5',
        input: { text: ['café'] },
      },
    ]);
    expect(gateway.run).toHaveBeenCalledTimes(1);
  });
});
