import { generateText } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiBinding } from '@/lib/embeddings';
import { createBudgetedWorkersAiBinding } from '@/lib/repo-ai-metadata';
import { estimateWorkersAiNeurons } from '@/lib/shared-ai-budget';

const MODEL = '@cf/baai/bge-base-en-v1.5';

function makeBudget(allowed: boolean) {
  const requests: Array<{ url: string; body: { neurons: number } }> = [];
  const namespace = {
    idFromName: vi.fn((name: string) => name),
    get: vi.fn(() => ({
      fetch: vi.fn(async (url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { neurons: number };
        requests.push({ url, body });
        const used = allowed ? body.neurons : 0;
        return Response.json({
          allowed,
          dayKey: new Date().toISOString().slice(0, 10),
          retryAfter: allowed ? 0 : 60,
          used,
          remaining: 9_500 - used,
        });
      }),
    })),
  };
  return { namespace, requests };
}

function workersResponse() {
  return {
    choices: [
      {
        message: { role: 'assistant', content: '{"summary":"ok"}' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 4, completion_tokens: 3 },
  };
}

describe('repo metadata Workers AI budget wrapper', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reserves the provider serialized input on each SDK invocation and preserves binding receiver', async () => {
    let receiver: unknown;
    const ai = {
      run: vi.fn(function (this: unknown, _model: string, _input: unknown) {
        receiver = this;
        return Promise.resolve(workersResponse());
      }),
    };
    const budget = makeBudget(true);
    const provider = createWorkersAI({
      binding: createBudgetedWorkersAiBinding(ai as unknown as AiBinding, budget.namespace),
    });
    const model = provider(MODEL);

    await generateText({ model, prompt: 'classify this repository', maxOutputTokens: 32 });
    await generateText({ model, prompt: 'classify this repository', maxOutputTokens: 32 });

    expect(ai.run).toHaveBeenCalledTimes(2);
    expect(receiver).toBe(ai);
    expect(budget.requests).toHaveLength(2);
    for (const [index, [modelId, serializedInput]] of ai.run.mock.calls.entries()) {
      expect(modelId).toBe(MODEL);
      expect(serializedInput).toHaveProperty('messages');
      expect(serializedInput).not.toHaveProperty('prompt');
      expect(budget.requests[index].url).toBe('https://internal.local/try-debit');
      expect(budget.requests[index].body.neurons).toBe(
        estimateWorkersAiNeurons(MODEL, serializedInput)
      );
    }
  });

  it('does not call the binding when the shared budget denies the provider request', async () => {
    const ai = { run: vi.fn().mockResolvedValue(workersResponse()) };
    const budget = makeBudget(false);
    const provider = createWorkersAI({
      binding: createBudgetedWorkersAiBinding(ai as unknown as AiBinding, budget.namespace),
    });

    await expect(
      generateText({ model: provider(MODEL), prompt: 'classify this repository', maxRetries: 0 })
    ).rejects.toThrow('Shared AI budget');

    expect(budget.requests).toHaveLength(1);
    expect(ai.run).not.toHaveBeenCalled();
  });
});
