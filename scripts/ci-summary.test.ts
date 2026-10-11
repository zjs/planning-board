import { describe, expect, it } from 'vitest';
import { summarize, type E2eReport, type Inputs } from './ci-summary.ts';

const e2e: E2eReport = {
  suites: [
    {
      specs: [{ tests: [{ projectName: 'file', status: 'expected' }] }],
      suites: [
        {
          specs: [
            { tests: [{ projectName: 'file', status: 'expected' }] },
            { tests: [{ projectName: 'relay', status: 'unexpected' }] },
            { tests: [{ projectName: 'relay', status: 'expected' }] },
          ],
        },
      ],
    },
  ],
};

const steps = (failAt?: string): Inputs['steps'] => {
  let failed = false;
  return ['Typecheck', 'Lint', 'Unit tests', 'Build', 'End-to-end tests'].map((name) => {
    if (failed) return { name, outcome: 'skipped' };
    if (name === failAt) {
      failed = true;
      return { name, outcome: 'failure' };
    }
    return { name, outcome: 'success' };
  });
};

describe('the CI summary', () => {
  it('says everything passed, with test counts and the build to download', () => {
    const md = summarize({
      steps: steps(),
      unit: { numTotalTests: 591, numPassedTests: 591, numFailedTests: 0 },
      e2e: { suites: [{ specs: [{ tests: [{ projectName: 'file', status: 'expected' }] }] }] },
      commit: 'abc123',
    });
    expect(md).toContain('### ✅ All checks passed');
    expect(md).toContain('| ✅ Unit tests | 591 passed |');
    expect(md).toContain('| ✅ End-to-end tests | file: 1 passed |');
    expect(md).toContain('planning-board-abc123.html');
  });

  it('names the step that failed, and counts end-to-end tests per project', () => {
    const md = summarize({
      steps: steps('End-to-end tests'),
      unit: { numTotalTests: 3, numPassedTests: 3, numFailedTests: 0 },
      e2e,
      commit: 'abc123',
    });
    expect(md).toContain('### ❌ Failed at: End-to-end tests');
    expect(md).toContain('| ❌ End-to-end tests | file: 2 passed; relay: 1 passed, 1 failed |');
  });

  it('says there is no build when the build failed, and skips the rest', () => {
    const md = summarize({ steps: steps('Build'), commit: 'abc123' });
    expect(md).toContain('### ❌ Failed at: Build');
    expect(md).toContain('| ⏭️ End-to-end tests |  |');
    expect(md).toContain('No build to download');
    expect(md).not.toContain('planning-board-abc123.html');
  });
});
