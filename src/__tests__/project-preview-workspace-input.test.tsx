import type { FormEvent, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ push: vi.fn(), swr: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('swr', () => ({ default: mocks.swr }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: (value: unknown) => [value, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock('@/components/project-recommendation-cards', () => ({
  GroundedToolRecommendationCard: vi.fn(),
  ProjectRecommendationCard: vi.fn(),
}));

import { ProjectPreviewWorkspace } from '@/components/project-preview-workspace';
import { validGitHubProjectInputs } from './fixtures/github-project-inputs';

describe('project preview workspace repository entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.swr.mockReturnValue({});
  });

  it.each(validGitHubProjectInputs)(
    'normalizes direct page input and resubmission of %s',
    (input) => {
      const tree = ProjectPreviewWorkspace({ initialRepository: input });
      expect(mocks.swr).toHaveBeenCalledWith(
        '/api/project-preview?repository=openai%2Fopenai-node',
        expect.any(Function),
        expect.any(Object)
      );

      const body = tree.props.children[1] as ReactElement<{
        children: ReactElement<{ onSubmit: (event: FormEvent<HTMLFormElement>) => void }>[];
      }>;
      const preventDefault = vi.fn();
      body.props.children[0].props.onSubmit({
        preventDefault,
      } as unknown as FormEvent<HTMLFormElement>);
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(mocks.push).toHaveBeenCalledWith('/project-preview?repository=openai%2Fopenai-node');
    }
  );
});
