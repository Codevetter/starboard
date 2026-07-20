'use client';

import '@saas-maker/feedback/dist/index.css';

import { FeedbackWidget } from '@saas-maker/feedback';

const API_KEY = process.env.NEXT_PUBLIC_SAASMAKER_API_KEY ?? '';
const API_BASE = 'https://api.sassmaker.com';

export function SaaSMakerFeedback() {
  if (!API_KEY) return null;
  return (
    <FeedbackWidget
      projectId={API_KEY}
      apiBaseUrl={API_BASE}
      position="bottom-right"
      theme="auto"
    />
  );
}
