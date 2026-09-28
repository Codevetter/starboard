import type { FeedbackSubmission } from '@saas-maker/feedback';

const FEEDBACK_API_URL = 'https://api.sassmaker.com/v1/feedback';

export async function submitSaaSMakerFeedback(
  submission: FeedbackSubmission,
  projectKey: string
): Promise<void> {
  const { screenshot, ...feedback } = submission;
  const body = new FormData();
  body.append(
    'feedback',
    JSON.stringify({
      type: feedback.type,
      title: feedback.title,
      description: feedback.description,
      submitter_email: feedback.email ?? '',
      submitter_name: feedback.name,
      page: feedback.page,
      anchor: feedback.anchor,
      source: 'widget',
      client_version: '0.4.0',
    })
  );
  if (screenshot) body.append('screenshot', screenshot);

  const response = await fetch(FEEDBACK_API_URL, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'X-Project-Key': projectKey },
    body,
  });
  if (!response.ok) throw new Error(`Feedback service returned HTTP ${response.status}.`);
}
