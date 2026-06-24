'use client';

import { useEffect } from 'react';
import { initVitals } from '@/lib/vitals';

export function VitalsReporter() {
  useEffect(() => {
    initVitals();
  }, []);
  return null;
}
