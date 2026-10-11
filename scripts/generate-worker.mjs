#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const source = new URL('./templates/worker.mjs', import.meta.url);
const destination = new URL('../worker.mjs', import.meta.url);
const content = await readFile(source, 'utf8');
await writeFile(destination, content);
