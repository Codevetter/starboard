#!/usr/bin/env node
import { runOverlay } from './overlay-astro-landing.mjs';

await runOverlay({ strict: process.argv.includes('--strict') });
