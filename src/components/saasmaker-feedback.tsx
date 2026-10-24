'use client';

import '@saas-maker/feedback/dist/index.css';

import { FeedbackWidget } from '@saas-maker/feedback';
import type { FeedbackSubmission } from '@saas-maker/feedback';
import { useTheme } from 'next-themes';
import foundry from '../../foundry.json';
import { submitSaaSMakerFeedback } from '@/lib/saasmaker-feedback';

function submitFeedback(submission: FeedbackSubmission) {
  return submitSaaSMakerFeedback(submission, foundry.projectKey);
}

export function SaaSMakerFeedback() {
  const { resolvedTheme } = useTheme();
  return (
    <FeedbackWidget
      onSubmit={submitFeedback}
      position="bottom-right"
      theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
      accentColor="var(--brand-ink)"
    />
  );
}
