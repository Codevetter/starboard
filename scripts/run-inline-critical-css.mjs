#!/usr/bin/env node
import { runInlineCss } from './inline-critical-css.mjs';

await runInlineCss({ strict: process.argv.includes('--strict') });
