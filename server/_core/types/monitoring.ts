/**
 * Monitoring types for Continuous Autonomous System
 */

export interface Metric {
  errors: {
    total: number;
    critical: number;
    warning: number;
    info: number;
    topErrors: Array<{
      message: string;
      count: number;
      lastSeen: Date;
    }>;
    errorTrend: "increasing" | "decreasing" | "stable";
  };
  performance: {
    latencyMs: {
      p50: number;
      p95: number;
      p99: number;
    };
    requestsPerSecond: number;
    errorRate: number;
    throughputTrend: "increasing" | "decreasing" | "stable";
    slowestEndpoints: Array<{
      path: string;
      latencyMs: number;
    }>;
  };
  tests: {
    statements: number;
    lines: number;
    functions: number;
    branches: number;
    trend: "increasing" | "decreasing" | "stable";
    flakyCounts: Array<{
      testName: string;
      failures: number;
      lastRun: Date;
    }>;
  };
  business: {
    dailyRevenue: number;
    ordersProcessed: number;
    avgResponseTime: number;
    customerNPS: number;
    operatorProductivity: number;
    errorsCaused: number;
    trend: {
      revenueMoM: string;
      ordersWoW: string;
    };
  };
  security: {
    vulnerabilities: {
      critical: number;
      high: number;
      medium: number;
    };
    items: Array<{
      id: string;
      severity: "critical" | "high" | "medium" | "low";
      package: string;
      fixAvailable: boolean;
    }>;
    lastScan: Date;
  };
}

export interface HealthReport {
  timestamp: Date;
  errors: Metric["errors"];
  performance: Metric["performance"];
  tests: Metric["tests"];
  business: Metric["business"];
  security: Metric["security"];
  summary: {
    status: "healthy" | "degraded" | "critical";
    score: number; // 0-100
    recommendations: string[];
  };
}

export interface Diagnosis {
  type: "latency" | "error" | "coverage" | "security";
  rootCause: string;
  severity: "critical" | "high" | "medium" | "low";
  recommendation: string;
}
