import { parseGitHubProjectInput } from '../../../src/lib/github-projects';

export function initializeProjectPreviewForm(form: HTMLFormElement) {
  const input = form.querySelector<HTMLInputElement>('input[name="repository"]');
  if (!input) return;

  const field = input;
  function validate() {
    const slug = parseGitHubProjectInput(field.value);
    field.setCustomValidity(
      slug ? '' : form.dataset.error || 'Enter a public GitHub URL or owner/repository.'
    );
    return slug;
  }

  // Clear custom validity before the template's input listener updates its alert.
  input.addEventListener('input', validate, true);
  form.addEventListener('submit', (event) => {
    const slug = validate();
    if (!slug) {
      event.preventDefault();
      input.reportValidity();
      return;
    }
    // Preserve the template's native same-origin GET navigation.
    input.value = slug.fullName;
  });
}
