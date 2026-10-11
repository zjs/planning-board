// The summary at the top of each CI run (`.github/workflows/ci.yml`): every step
// of the app's job with how it went, the test counts, and the build to download.
// Run by CI as its last step, even when an earlier one failed:
//
//   node scripts/ci-summary.ts >> "$GITHUB_STEP_SUMMARY"
//
// Step outcomes come from the environment (STEP_<NAME>=success|failure|skipped),
// and test counts from the JSON reports Vitest and Playwright write to reports/.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Outcome = 'success' | 'failure' | 'cancelled' | 'skipped' | '';

export interface UnitReport {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
}

interface PlaywrightTest {
  projectName: string;
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
}
interface PlaywrightSuite {
  suites?: PlaywrightSuite[];
  specs?: { tests: PlaywrightTest[] }[];
}
export interface E2eReport {
  suites: PlaywrightSuite[];
}

export interface Inputs {
  steps: { name: string; outcome: Outcome }[];
  unit?: UnitReport | undefined;
  e2e?: E2eReport | undefined;
  commit: string;
}

const MARK: Record<Outcome, string> = {
  success: '✅',
  failure: '❌',
  cancelled: '⏹️',
  skipped: '⏭️',
  '': '⏭️',
};

function e2eCounts(report: E2eReport): Map<string, { passed: number; failed: number; flaky: number; skipped: number }> {
  const byProject = new Map<string, { passed: number; failed: number; flaky: number; skipped: number }>();
  const walk = (suite: PlaywrightSuite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const counts = byProject.get(test.projectName) ?? { passed: 0, failed: 0, flaky: 0, skipped: 0 };
        if (test.status === 'expected') counts.passed++;
        else if (test.status === 'unexpected') counts.failed++;
        else if (test.status === 'flaky') counts.flaky++;
        else counts.skipped++;
        byProject.set(test.projectName, counts);
      }
    }
    suite.suites?.forEach(walk);
  };
  report.suites.forEach(walk);
  return byProject;
}

/** What a step's row says beside its mark: the test counts, where it has them. */
function detail(name: string, inputs: Inputs): string {
  if (name === 'Unit tests' && inputs.unit) {
    const { numPassedTests, numFailedTests } = inputs.unit;
    return numFailedTests ? `${numPassedTests} passed, ${numFailedTests} failed` : `${numPassedTests} passed`;
  }
  if (name === 'End-to-end tests' && inputs.e2e) {
    return [...e2eCounts(inputs.e2e)]
      .map(([project, c]) => {
        const parts = [`${c.passed} passed`];
        if (c.failed) parts.push(`${c.failed} failed`);
        if (c.flaky) parts.push(`${c.flaky} flaky`);
        if (c.skipped) parts.push(`${c.skipped} skipped`);
        return `${project}: ${parts.join(', ')}`;
      })
      .join('; ');
  }
  return '';
}

export function summarize(inputs: Inputs): string {
  const failed = inputs.steps.find((s) => s.outcome === 'failure');
  const lines = [
    failed ? `### ❌ Failed at: ${failed.name}` : '### ✅ All checks passed',
    '',
    '| Step | Result |',
    '|---|---|',
    ...inputs.steps.map((s) => `| ${MARK[s.outcome]} ${s.name} | ${detail(s.name, inputs)} |`),
    '',
  ];
  const built = inputs.steps.find((s) => s.name === 'Build')?.outcome === 'success';
  if (built) {
    lines.push(
      `**The build:** download **planning-board-${inputs.commit}.html** from the Artifacts section below, and open it in a browser.`,
    );
  } else {
    lines.push('No build to download: the build step didn’t succeed.');
  }
  return lines.join('\n') + '\n';
}

/** A report a test run wrote, or undefined when that run didn't happen. */
function readJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

// Run as a script, not when a test imports it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const step = (env: string): Outcome => (process.env[env] ?? '') as Outcome;
  process.stdout.write(
    summarize({
      steps: [
        { name: 'Typecheck', outcome: step('STEP_TYPECHECK') },
        { name: 'Lint', outcome: step('STEP_LINT') },
        { name: 'Unit tests', outcome: step('STEP_UNIT') },
        { name: 'Build', outcome: step('STEP_BUILD') },
        { name: 'End-to-end tests', outcome: step('STEP_E2E') },
      ],
      unit: readJson('reports/unit.json') as UnitReport | undefined,
      e2e: readJson('reports/e2e.json') as E2eReport | undefined,
      commit: process.env.BUILD_COMMIT ?? 'unknown',
    }),
  );
}
