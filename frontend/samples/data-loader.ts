import * as fs from "fs";
import * as path from "path";

const SCENARIO_DIR = path.resolve(__dirname, "../data/ui-scenarios");
const TOKEN = process.env.TOKEN || "";

if (!TOKEN) {
  console.error("Error: TOKEN environment variable is not set.");
  process.exit(1);
}

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
}

export interface TestConfig {
  description: string;
  enabled: boolean;
  testSteps: TestStep[];
  testOrder: number;
}

export const loadTestScenarios = (): TestConfig[] => {
  if (!fs.existsSync(SCENARIO_DIR)) {
    console.error(`Scenario directory not found: ${SCENARIO_DIR}`);
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
      if (config.enabled) {
        for (const step of config.testSteps) {
          if (
            step.path &&
            typeof step.path === "string" &&
            step.action === "goto"
          ) {
            step.path = step.path.replace("${TOKEN}", TOKEN);
          }
        }
        scenarios.push(config);
      }
    } catch (e) {
      console.error(`Failed to parse JSON file: ${file}`, e);
    }
  }
  // Sort by testOrder if present, otherwise keep original order
  scenarios.sort((a, b) => {
    if (typeof a.testOrder === "number" && typeof b.testOrder === "number") {
      return a.testOrder - b.testOrder;
    }
    if (typeof a.testOrder === "number") return -1;
    if (typeof b.testOrder === "number") return 1;
    return 0;
  });
  return scenarios;
};
