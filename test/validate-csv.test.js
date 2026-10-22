import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('scores an Excel-style semicolon CSV with commas inside fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fv-'));
  const f = join(dir, 'v.csv');
  writeFileSync(f, '﻿n;site;task;judge;human;note\r\n1;a;Are returns free, or not?;pass;pass;\r\n2;b;Which countries, exactly?;fail;pass;wrong\r\n');
  const out = execFileSync('node', ['bin/fir-validate.js', 'score', f], { encoding: 'utf8' });
  assert.match(out, /Checked: 2/);
  assert.match(out, /Agreement: 50%/);
});
