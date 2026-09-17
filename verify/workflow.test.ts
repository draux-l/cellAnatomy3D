import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * Structural checks on the CI workflow.
 *
 * GitHub Actions cannot be executed from this repository's verification harness, so the
 * workflow's *contract* is asserted instead: verification on every pull request, deployment
 * only from a push to main, and a deploy job that cannot run before verification passed.
 * These are the properties the spec's "Deploy Only On Merge To Main" requirement depends on,
 * and they are exactly the properties a later edit is most likely to break by accident.
 */

const WORKFLOW_PATH = fileURLToPath(new URL('../.github/workflows/verify.yml', import.meta.url));

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
}

interface WorkflowJob {
  needs?: string | string[];
  if?: string;
  steps?: WorkflowStep[];
}

interface Workflow {
  on?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
}

const workflow = parse(readFileSync(WORKFLOW_PATH, 'utf8')) as Workflow;
const jobs = workflow.jobs ?? {};

function stepsOf(job: WorkflowJob | undefined): WorkflowStep[] {
  return job?.steps ?? [];
}

function needsOf(job: WorkflowJob | undefined): string[] {
  if (!job?.needs) {
    return [];
  }

  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

describe('verify workflow triggers', () => {
  it('runs on every pull request', () => {
    expect(workflow.on).toBeDefined();
    expect(Object.keys(workflow.on ?? {})).toContain('pull_request');
  });

  it('runs on pushes to main', () => {
    const push = (workflow.on as Record<string, { branches?: string[] }> | undefined)?.push;

    expect(push?.branches).toEqual(['main']);
  });
});

describe('verify job', () => {
  it('runs the same command developers run locally', () => {
    const commands = stepsOf(jobs.verify).map((step) => step.run ?? '');

    expect(commands.some((command) => command.includes('npm run verify'))).toBe(true);
  });

  it('installs the pinned browser before the harness runs', () => {
    const commands = stepsOf(jobs.verify).map((step) => step.run ?? '');
    const verifyIndex = commands.findIndex((command) => command.includes('npm run verify'));
    const browserIndex = commands.findIndex((command) =>
      command.includes('playwright install --with-deps chromium'),
    );

    expect(browserIndex).toBeGreaterThanOrEqual(0);
    expect(browserIndex).toBeLessThan(verifyIndex);
  });

  it('never deploys anything', () => {
    const deploys = stepsOf(jobs.verify).filter((step) =>
      (step.uses ?? '').includes('wrangler-action'),
    );

    expect(deploys).toEqual([]);
  });
});

describe('deploy job', () => {
  it('waits for verification to pass', () => {
    expect(needsOf(jobs.deploy)).toContain('verify');
  });

  it('only runs for a push to main', () => {
    const condition = jobs.deploy?.if ?? '';

    expect(condition).toContain("github.event_name == 'push'");
    expect(condition).toContain("github.ref == 'refs/heads/main'");
    expect(condition).not.toContain('pull_request');
  });

  it('deploys only when credentials are configured', () => {
    const deployStep = stepsOf(jobs.deploy).find((step) =>
      (step.uses ?? '').includes('wrangler-action'),
    );

    expect(deployStep).toBeDefined();
    expect(deployStep?.if).toContain('credentials.outputs.available');
  });

  it('deploys the artifact verification ran against, without rebuilding', () => {
    const steps = stepsOf(jobs.deploy);
    const downloads = steps.find((step) => (step.uses ?? '').includes('download-artifact'));
    const rebuilds = steps.filter((step) => (step.run ?? '').includes('npm run build'));

    expect(downloads).toBeDefined();
    expect(rebuilds).toEqual([]);
  });
});
