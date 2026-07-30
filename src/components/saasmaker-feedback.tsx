'use client';

import '@saas-maker/feedback/dist/index.css';

import { FeedbackWidget } from '@saas-maker/feedback';

const FEEDBACK_INGESTION_URL = 'https://feedback.sassmaker.com/api/feedback';

export function SaaSMakerFeedback() {
  return (
    <FeedbackWidget ingestionUrl={FEEDBACK_INGESTION_URL} position="bottom-right" theme="auto" />
  );
}
