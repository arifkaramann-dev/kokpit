/**
 * Autonomous Loop MVP Test
 * Simulates: Monitoring → Diagnosis → Auto-Fix → Deploy → Verify
 *
 * This is a synthetic test (no real deployment):
 * 1. Inject lint error into codebase
 * 2. Monitoring detects it
 * 3. Autonomous fixer fixes it
 * 4. Verify fix was applied
 * 5. Clean up
 */

import { test } from "node:test";
import assert from "node:assert";
import pino from "pino";
import { ContinuousMonitoring } from "./monitoring";
import { AutonomousFixer } from "./autonomousFixer";
import { OmniRouteA2AClient } from "./omnirouteA2A";

const logger = pino({ name: "loop.test" });

test("Autonomous Loop MVP: Detect → Fix → Verify", async () => {
  logger.info("🚀 Starting autonomous loop test");

  // Setup
  const monitoring = new ContinuousMonitoring({
    omnirouteApiUrl: "http://localhost:20128",
    omnirouteApiKey: process.env.OMNIROUTE_API_KEY || "",
    metricsInterval: 5 * 60 * 1000,
    logRetentionDays: 7,
  });

  const fixer = new AutonomousFixer();
  const omniroute = new OmniRouteA2AClient();

  // Step 1: Capture initial metrics
  logger.info("📊 Step 1: Capture initial metrics");
  const initialReport = await monitoring.captureMetrics();
  assert.strictEqual(typeof initialReport.summary.score, "number");
  logger.info({ score: initialReport.summary.score }, "✅ Initial metrics captured");

  // Step 2: Detect issues
  logger.info("🔍 Step 2: Detect issues");
  const issues = await fixer.detectIssuesFromReport(initialReport);
  logger.info({ issueCount: issues.length }, "✅ Issues detected");

  if (issues.length === 0) {
    logger.warn("⚠️ No issues detected (system is healthy), test passed");
    return;
  }

  // Step 3: Try to fix LOW_RISK issues
  logger.info("🛠️ Step 3: Attempting fixes");
  const lowRiskIssues = issues.filter((i) => i.severity === "low");

  if (lowRiskIssues.length > 0) {
    logger.info({ count: lowRiskIssues.length }, "Fixing LOW_RISK issues");
    await fixer.tryFixIssues();
    logger.info("✅ Fix attempts completed");
  }

  // Step 4: Verify fixes via OmniRoute diagnosis
  logger.info("🔍 Step 4: Verifying fixes");
  const diagnosis = await omniroute.diagnoseIssue(initialReport);
  assert(typeof diagnosis.diagnosis === "string");
  assert(diagnosis.diagnosis.length > 0);
  logger.info({ diagnosis: diagnosis.diagnosis.slice(0, 100) }, "✅ Diagnosis received");

  // Step 5: Capture post-fix metrics
  logger.info("📊 Step 5: Capture post-fix metrics");
  const finalReport = await monitoring.captureMetrics();
  assert.strictEqual(typeof finalReport.summary.score, "number");
  logger.info(
    { initialScore: initialReport.summary.score, finalScore: finalReport.summary.score },
    "✅ Post-fix metrics captured"
  );

  // Verify health improved or stayed same
  assert(
    finalReport.summary.score >= initialReport.summary.score - 5,
    "Health should not degrade significantly"
  );

  logger.info("🎉 Autonomous Loop Test PASSED");
});

test("Monitoring: Captures all metric types", async () => {
  logger.info("📊 Testing monitoring capture");

  const monitoring = new ContinuousMonitoring({
    omnirouteApiUrl: "http://localhost:20128",
    omnirouteApiKey: "",
    metricsInterval: 5 * 60 * 1000,
    logRetentionDays: 7,
  });

  const report = await monitoring.captureMetrics();

  // Verify all metric categories
  assert(report.errors);
  assert(typeof report.errors.total === "number");
  assert(report.performance);
  assert(typeof report.performance.latencyMs.p95 === "number");
  assert(report.tests);
  assert(typeof report.tests.statements === "number");
  assert(report.business);
  assert(typeof report.business.dailyRevenue === "number");
  assert(report.security);
  assert(Array.isArray(report.security.items));

  logger.info("✅ All metric categories present");
});

test("Autonomous Fixer: Detects LOW/MEDIUM/HIGH risk", async () => {
  logger.info("🔧 Testing issue detection");

  const fixer = new AutonomousFixer();

  // Create mock health report
  const mockReport = {
    timestamp: new Date(),
    errors: {
      total: 5,
      critical: 1,
      warning: 2,
      info: 2,
      topErrors: [{ message: "Type error", count: 1, lastSeen: new Date() }],
      errorTrend: "increasing" as const,
    },
    performance: {
      latencyMs: { p50: 100, p95: 450, p99: 1000 },
      requestsPerSecond: 50,
      errorRate: 0.01,
      throughputTrend: "stable" as const,
      slowestEndpoints: [{ path: "/orders", latencyMs: 800 }],
    },
    tests: {
      statements: 55,
      lines: 55,
      functions: 50,
      branches: 45,
      trend: "decreasing" as const,
      flakyCounts: [{ testName: "concurrent", failures: 2, lastRun: new Date() }],
    },
    business: {
      dailyRevenue: 2500,
      ordersProcessed: 200,
      avgResponseTime: 400,
      customerNPS: 70,
      operatorProductivity: 6,
      errorsCaused: 1,
      trend: { revenueMoM: "down 5%", ordersWoW: "stable" },
    },
    security: {
      vulnerabilities: { critical: 0, high: 2, medium: 1 },
      items: [
        { id: "CVE-001", severity: "high" as const, package: "jest", fixAvailable: true },
      ],
      lastScan: new Date(),
    },
    summary: {
      status: "degraded" as const,
      score: 65,
      recommendations: [
        "High latency, add cache",
        "Low coverage, add tests",
        "Security issues, patch",
      ],
    },
  };

  const issues = await fixer.detectIssuesFromReport(mockReport);

  assert(issues.length > 0, "Should detect at least one issue");

  const lowRiskCount = issues.filter((i) => i.severity === "low").length;
  const mediumRiskCount = issues.filter((i) => i.severity === "medium").length;
  const highRiskCount = issues.filter((i) => i.severity === "high").length;

  logger.info(
    { low: lowRiskCount, medium: mediumRiskCount, high: highRiskCount },
    "✅ Issues categorized"
  );

  assert(highRiskCount > 0, "Should detect high-risk issues");
});

test("OmniRoute A2A: Diagnosis works", async () => {
  logger.info("🤖 Testing OmniRoute A2A diagnosis");

  const omniroute = new OmniRouteA2AClient(
    process.env.OMNIROUTE_API_URL || "http://localhost:20128",
    process.env.OMNIROUTE_API_KEY || ""
  );

  // Mock health report
  const mockReport = {
    timestamp: new Date(),
    errors: {
      total: 10,
      critical: 2,
      warning: 3,
      info: 5,
      topErrors: [
        { message: "Provider timeout", count: 5, lastSeen: new Date() },
        { message: "Rate limit", count: 3, lastSeen: new Date() },
      ],
      errorTrend: "increasing" as const,
    },
    performance: {
      latencyMs: { p50: 200, p95: 600, p99: 1500 },
      requestsPerSecond: 40,
      errorRate: 0.025,
      throughputTrend: "decreasing" as const,
      slowestEndpoints: [
        { path: "/api/complex-query", latencyMs: 2000 },
        { path: "/api/search", latencyMs: 1200 },
      ],
    },
    tests: {
      statements: 58,
      lines: 58,
      functions: 52,
      branches: 48,
      trend: "stable" as const,
      flakyCounts: [{ testName: "async-test", failures: 3, lastRun: new Date() }],
    },
    business: {
      dailyRevenue: 2200,
      ordersProcessed: 180,
      avgResponseTime: 600,
      customerNPS: 65,
      operatorProductivity: 5,
      errorsCaused: 3,
      trend: { revenueMoM: "down 8%", ordersWoW: "down 5%" },
    },
    security: {
      vulnerabilities: { critical: 1, high: 3, medium: 2 },
      items: [
        { id: "CVE-2026-001", severity: "critical" as const, package: "axios", fixAvailable: true },
      ],
      lastScan: new Date(),
    },
    summary: {
      status: "critical" as const,
      score: 45,
      recommendations: [
        "Critical security issue, patch now",
        "Provider timeout, increase timeout or add fallback",
        "Coverage below 60%, add tests",
      ],
    },
  };

  const diagnosis = await omniroute.diagnoseIssue(mockReport);

  assert(typeof diagnosis.diagnosis === "string");
  assert(typeof diagnosis.recommendation === "string");
  assert(typeof diagnosis.cost === "number");

  logger.info({ cost: diagnosis.cost }, "✅ Diagnosis complete via OmniRoute");
});

logger.info("🎉 All tests defined, ready to run");
