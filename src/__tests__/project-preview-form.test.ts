import { describe, expect, it, vi } from 'vitest';

import { initializeProjectPreviewForm } from '../../landing-astro/src/scripts/project-preview-form';
import {
  invalidGitHubProjectInputs,
  validGitHubProjectInputs,
} from './fixtures/github-project-inputs';

function heroForm(value: string) {
  const input = Object.assign(new EventTarget(), {
    value,
    setCustomValidity: vi.fn(),
    reportValidity: vi.fn(),
  });
  const form = Object.assign(new EventTarget(), {
    dataset: { error: 'Enter a public GitHub URL or owner/repository.' },
    querySelector: () => input,
  });
  initializeProjectPreviewForm(form as unknown as HTMLFormElement);
  return { form, input };
}

describe('landing hero repository submission', () => {
  it.each(validGitHubProjectInputs)('submits %s as owner/repo using native GET', (value) => {
    const { form, input } = heroForm(value);
    const submit = new Event('submit', { cancelable: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(false);
    expect(input.value).toBe('openai/openai-node');
    expect(input.setCustomValidity).toHaveBeenLastCalledWith('');
  });

  it.each(invalidGitHubProjectInputs)('blocks malformed input %s', (value) => {
    const { form, input } = heroForm(value);
    const submit = new Event('submit', { cancelable: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(input.setCustomValidity).toHaveBeenLastCalledWith(form.dataset.error);
    expect(input.reportValidity).toHaveBeenCalledOnce();
  });

  it('clears a validation error when the user corrects the repository', () => {
    const { input } = heroForm('invalid');
    input.dispatchEvent(new Event('input'));
    expect(input.setCustomValidity).toHaveBeenLastCalledWith(expect.any(String));
    input.value = 'https://github.com/openai/openai-node';
    input.dispatchEvent(new Event('input'));
    expect(input.setCustomValidity).toHaveBeenLastCalledWith('');
  });
});
