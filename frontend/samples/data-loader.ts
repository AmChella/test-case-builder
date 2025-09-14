import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

const SCENARIO_DIR = path.resolve(__dirname, "../data/ui-scenarios");
// const TOKEN = process.env.TOKEN || "";
// if (!TOKEN) {
//   logger.warn("TOKEN environment variable is not set. URL placeholders will not be replaced.", "data-loader");
// }

export interface ValidationStep {
  type: string;
  selector?: string;
  selectorType?: string;
  data?: any;
  path?: string;
  soft?: boolean;
  message?: string;
  attribute?: string;
  cssProperty?: string;
  // For custom validations: specify the name defined in customValidationMap
  customName?: string;
}

export interface TestStep {
  stepName: string;
  action: string;
  selector?: string;
  path?: string;
  selectorType?: "css" | "xpath" | "id" | "text" | "testId";
  data?: any;
  waitTime?: number;
  validations?: ValidationStep[];
  // Optional: index selection when multiple elements match
  nth?: number;
  // Optional: action-specific options forwarded to Playwright APIs (e.g., timeout, force, noWaitAfter)
  actionOptions?: Record<string, any>;
  // Upload-specific configuration
  files?: Array<{
    path?: string; // path to file on disk
    name?: string; // virtual filename when using contentBase64
    mimeType?: string; // optional mime type for content payloads
    contentBase64?: string; // base64-encoded file content
  }>;
  // How to resolve relative file paths for upload; 'cwd' (default) resolves from project root, 'none' uses the path as-is
  resolveFrom?: "cwd" | "none";
  // If true, clears existing selected files before setting new ones
  clearFirst?: boolean;
}

export interface TestConfig {
  description: string;
  enabled: boolean;
  testSteps: TestStep[];
  testOrder: number;
}

export const loadTestScenarios = (): TestConfig[] => {
  // 1) If SCENARIOS_JSON provided, parse and return
  const inline = process.env.SCENARIOS_JSON;
  if (inline && inline.trim().length > 0) {
    try {
      const parsed = JSON.parse(inline);
      const arr: TestConfig[] = Array.isArray(parsed) ? parsed : [parsed];
      return normalizeAndPrepare(arr);
    } catch (e) {
      logger.error(
        `Failed to parse SCENARIOS_JSON: ${(e as Error).message}`,
        "data-loader"
      );
      return [];
    }
  }

  // 2) If SCENARIOS_FILE provided, read that file
  const fileEnv = process.env.SCENARIOS_FILE;
  if (fileEnv && fs.existsSync(fileEnv)) {
    try {
      const content = fs.readFileSync(fileEnv, "utf-8");
      const parsed = JSON.parse(content);
      const arr: TestConfig[] = Array.isArray(parsed) ? parsed : [parsed];
      return normalizeAndPrepare(arr);
    } catch (e) {
      logger.error(
        `Failed to read SCENARIOS_FILE: ${(e as Error).message}`,
        "data-loader"
      );
      return [];
    }
  }

  // 3) Fallback to disk directory
  if (!fs.existsSync(SCENARIO_DIR)) {
    logger.error(
      `Scenario directory not found: ${SCENARIO_DIR}`,
      "data-loader"
    );
    return [];
  }

  const files = fs
    .readdirSync(SCENARIO_DIR)
    .filter((file) => file.endsWith(".json"));
  const scenarios: TestConfig[] = [];

  for (const file of files) {
    const filePath = path.join(SCENARIO_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");
    try {
      const config = JSON.parse(content);
      scenarios.push(config);
    } catch (e) {
      logger.error(
        `Failed to parse JSON file: ${file} ${(e as Error).message}`,
        "data-loader"
      );
    }
  }
  return normalizeAndPrepare(scenarios);
};

function normalizeAndPrepare(input: TestConfig[]): TestConfig[] {
  const prepared: TestConfig[] = [];
  for (const config of input) {
    if (config.enabled === false) continue; // skip disabled
    // default enabled if missing
    (config as any).enabled = config.enabled ?? true;
    // token replacement for goto
    // for (const step of config.testSteps || []) {
    //   if (step.path && typeof step.path === "string" && step.action === "goto") {
    //     if (TOKEN) {
    //       step.path = step.path.replace("${TOKEN}", TOKEN);
    //     }
    //   }
    // }
    prepared.push(config);
  }
  prepared.sort((a, b) => {
    if (typeof a.testOrder === "number" && typeof b.testOrder === "number") {
      return a.testOrder - b.testOrder;
    }
    if (typeof a.testOrder === "number") return -1;
    if (typeof b.testOrder === "number") return 1;
    return 0;
  });
  return prepared;
}
