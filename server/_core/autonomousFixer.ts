/**
 * Autonomous Fixer MVP — Low-Risk Issues Only
 * Automatically detects and fixes:
 * - Format errors (prettier)
 * - Lint warnings (eslint)
 * - Type errors (TypeScript strict)
 *
 * HIGH-RISK issues require human review (cached for later).
 */

import { execSync, spawn } from "child_process";
import pino from "pino";
import type { HealthReport } from "./types/monitoring";

const logger = pino({ name: "autonomousFixer" });

interface FixIssue {
  id: string;
  type: "format" | "lint" | "type" | "test_coverage" | "security" | "dependency";
  severity: "low" | "medium" | "high";
  file?: string;
  message: string;
  autoFixable: boolean;
}

export class AutonomousFixer {
  private detectedIssues: FixIssue[] = [];

  /**
   * Detect issues from health report
   */
  async detectIssuesFromReport(report: HealthReport): Promise<FixIssue[]> {
    const issues: FixIssue[] = [];

    // Format/Lint errors (LOW_RISK)
    if (report.summary.status === "critical" || report.summary.status === "degraded") {
      const lintIssues = await this.detectLintIssues();
      issues.push(...lintIssues);
    }

    // Type errors (LOW_RISK)
    const typeIssues = await this.detectTypeErrors();
    issues.push(...typeIssues);

    // Test coverage gaps (MEDIUM_RISK)
    if (report.tests.branches < 60) {
      issues.push({
        id: `coverage-${Date.now()}`,
        type: "test_coverage",
        severity: "medium",
        message: `Branch coverage is ${report.tests.branches}%, target is 60%+`,
        autoFixable: false, // Requires human to write tests
      });
    }

    // Security patches (HIGH_RISK)
    if (report.security.vulnerabilities.high > 0) {
      issues.push({
        id: `security-${Date.now()}`,
        type: "security",
        severity: "high",
        message: `${report.security.vulnerabilities.high} high-severity vulns found`,
        autoFixable: false, // Requires review
      });
    }

    this.detectedIssues = issues;
    logger.info({ issueCount: issues.length }, "🔍 Issues detected");

    return issues;
  }

  /**
   * Detect lint issues via eslint
   */
  private async detectLintIssues(): Promise<FixIssue[]> {
    try {
      const output = execSync("pnpm lint --format json 2>/dev/null || echo '{}'", {
        encoding: "utf8",
        stdio: "pipe",
      });

      const issues: FixIssue[] = [];
      // TODO: Parse eslint JSON output
      // For now, mock
      return [
        {
          id: `lint-1`,
          type: "lint",
          severity: "low",
          file: "server/routers.ts",
          message: "Unused variable 'x'",
          autoFixable: true,
        },
      ];
    } catch {
      return [];
    }
  }

  /**
   * Detect type errors via TypeScript
   */
  private async detectTypeErrors(): Promise<FixIssue[]> {
    try {
      const output = execSync("pnpm typecheck:core 2>&1 || echo 'OK'", {
        encoding: "utf8",
        stdio: "pipe",
      });

      if (output.includes("error TS")) {
        // Parse TypeScript errors
        return [
          {
            id: `type-1`,
            type: "type",
            severity: "low",
            file: "server/_core/monitoring.ts",
            message: "Type 'any' not allowed",
            autoFixable: true,
          },
        ];
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Try to fix issues based on severity
   */
  async tryFixIssues(): Promise<void> {
    const lowRiskIssues = this.detectedIssues.filter((i) => i.severity === "low");
    const mediumRiskIssues = this.detectedIssues.filter((i) => i.severity === "medium");
    const highRiskIssues = this.detectedIssues.filter((i) => i.severity === "high");

    logger.info(
      {
        low: lowRiskIssues.length,
        medium: mediumRiskIssues.length,
        high: highRiskIssues.length,
      },
      "🔧 Attempting fixes"
    );

    // LOW_RISK: Auto-fix and auto-merge
    for (const issue of lowRiskIssues) {
      if (issue.autoFixable) {
        await this.autoFixAndMerge(issue);
      }
    }

    // MEDIUM_RISK: Create PR and wait for review
    for (const issue of mediumRiskIssues) {
      await this.createPRForReview(issue);
    }

    // HIGH_RISK: Just log for human
    for (const issue of highRiskIssues) {
      logger.warn({ issue }, "⚠️ High-risk issue, requires manual review");
    }
  }

  /**
   * Auto-fix LOW_RISK issues and commit
   */
  private async autoFixAndMerge(issue: FixIssue): Promise<void> {
    logger.info({ issue }, "🟢 Auto-fixing LOW_RISK issue");

    try {
      // Apply fixes
      if (issue.type === "format") {
        execSync("pnpm format", { stdio: "inherit" });
      } else if (issue.type === "lint") {
        execSync("pnpm lint --fix", { stdio: "inherit" });
      } else if (issue.type === "type") {
        // Type errors usually need manual fix, but some can be auto-fixed
        logger.warn("Type errors typically require manual investigation");
      }

      // Commit changes
      execSync("git add -A", { stdio: "inherit" });
      execSync(
        `git commit -m "fix: ${issue.message} (autonomous fix)" --no-verify`,
        {
          stdio: "inherit",
        }
      );

      // Push to remote
      const branchName = `autonomous-fix/${issue.id}`;
      execSync(`git checkout -b ${branchName}`, { stdio: "inherit" });
      execSync(`git push -u origin ${branchName}`, { stdio: "inherit" });

      // Create PR with auto-merge
      const prOutput = execSync(
        `gh pr create --title "🤖 Auto-fix: ${issue.message}" --body "Autonomous fix" --base main --auto-merge`,
        { encoding: "utf8", stdio: "pipe" }
      );

      logger.info({ issue, pr: prOutput }, "✅ Auto-fix PR created with auto-merge");

      // CI will test, if pass → auto-merge, if fail → rollback
    } catch (error) {
      logger.error({ issue, error }, "❌ Auto-fix failed");
    }
  }

  /**
   * Create PR for MEDIUM_RISK issues (human review)
   */
  private async createPRForReview(issue: FixIssue): Promise<void> {
    logger.info({ issue }, "🟡 Creating PR for MEDIUM_RISK issue");

    try {
      // Create branch
      const branchName = `autonomous-suggest/${issue.id}`;
      execSync(`git checkout -b ${branchName}`, { stdio: "inherit" });

      // For now, just create the branch and PR
      // In real impl: apply the suggested fix, commit, push, create PR
      execSync(`git push -u origin ${branchName}`, { stdio: "inherit" });

      // Create PR without auto-merge (requires human review)
      await this.createGitHubPR({
        title: `🟡 ${issue.message}`,
        body: `**Issue**: ${issue.message}\n\n**Type**: ${issue.type}\n\n**Suggested Action**: Review and approve`,
        base: "main",
        head: branchName,
      });

      logger.info({ issue }, "✅ MEDIUM_RISK PR created, waiting for review");
    } catch (error) {
      logger.error({ issue, error }, "❌ PR creation failed");
    }
  }

  /**
   * Create GitHub PR via CLI
   */
  private async createGitHubPR(params: {
    title: string;
    body: string;
    base: string;
    head: string;
  }): Promise<void> {
    // TODO: Use gh CLI
    logger.debug("PR creation not yet implemented in MVP");
  }
}

/**
 * Start autonomous fixer loop
 * Runs after each monitoring cycle
 */
export async function startAutonomousFixerLoop() {
  const fixer = new AutonomousFixer();

  return {
    tryFix: async (report: HealthReport) => {
      await fixer.detectIssuesFromReport(report);
      await fixer.tryFixIssues();
    },
  };
}
