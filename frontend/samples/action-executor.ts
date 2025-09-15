import { expect, Page, Locator } from "@playwright/test";
import { customLogicMap, customValidationMap } from "./custom-logic";
import type { TestStep, ValidationStep } from "./data-loader";
import { logger } from "./logger";

export class ActionExecutor {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  getLocator(
    selector: string,
    selectorType: "css" | "xpath" | "id" | "text" | "testId" = "css"
  ): Locator {
    switch (selectorType) {
      case "css":
        return this.page.locator(selector);
      case "xpath":
        return this.page.locator(`xpath=${selector}`);
      case "id":
        return this.page.locator(`#${selector}`);
      case "text":
        return this.page.locator(`text=${selector}`);
      case "testId":
        return this.page.getByTestId(selector);
      default:
        throw new Error(`Unsupported selector type: ${selectorType}`);
    }
  }

  /**
   * Executes a test step, supporting configurable actions, iteration, and custom logic.
   */
  async executeStep(step: TestStep, context: Record<string, any> = {}) {
    let locator: Locator | undefined;
    if (step.selector) {
      locator = this.getLocator(step.selector, step.selectorType);
      if (typeof step.nth === "number" && step.nth >= 0) {
        locator = locator.nth(step.nth);
      }
    }

    // Support iteration if step.iterate is true and locator resolves to multiple elements
    // @ts-ignore allow iterate optional custom flag from JSON
    if ((step as any).iterate && locator) {
      const count = await locator.count();
      for (let i = 0; i < count; i++) {
        const nthLocator = locator.nth(i);
        // Execute action for this iteration
        await this._executeAction(step, nthLocator, context);
        // Apply wait time per iteration if provided
        if (step.waitTime) {
          await this.page.waitForTimeout(step.waitTime);
        }
        // Execute validations for this iteration (use the iteration-specific locator)
        if (step.validations) {
          for (const validation of step.validations) {
            await this.executeValidation(validation, {
              locator: nthLocator,
              context,
            });
          }
        }
      }
    } else {
      // Non-iterative path: single action, optional wait, then validations once
      await this._executeAction(step, locator, context);
      if (step.waitTime) {
        await this.page.waitForTimeout(step.waitTime);
      }
      if (step.validations) {
        for (const validation of step.validations) {
          await this.executeValidation(validation, { locator, context });
        }
      }
    }
  }

  /**
   * Internal: Executes a single action on a locator or the page.
   */
  async _executeAction(
    step: TestStep,
    locator?: Locator,
    context: Record<string, any> = {}
  ) {
    switch (step.action) {
      case "goto":
        await this.page.goto(
          String(step.path ?? "/"),
          step.actionOptions as any
        );
        break;
      case "upload": {
        if (!locator)
          throw new Error(
            "upload requires a selector pointing to an <input type='file'> element"
          );
        // Two ways to provide files:
        // 1) step.files: array with { path | contentBase64, name, mimeType }
        // 2) step.data: string or array of strings with file paths
        const toUploads: any[] = [];
        const resolveFrom = step.resolveFrom || "cwd";
        const pathMod = require("path");

        if (Array.isArray(step.files) && step.files.length) {
          for (const f of step.files) {
            if (f.contentBase64) {
              const buf = Buffer.from(String(f.contentBase64), "base64");
              toUploads.push({
                buffer: buf,
                name: f.name || "upload.bin",
                mimeType: f.mimeType,
              });
            } else if (f.path) {
              const p = String(f.path);
              const resolvedPath =
                resolveFrom === "cwd" &&
                !(p.startsWith("/") || p.match(/^[A-Za-z]:\\\\/))
                  ? pathMod.resolve(process.cwd(), p)
                  : p;
              toUploads.push(resolvedPath);
            }
          }
        } else {
          const asArray = Array.isArray(step.data) ? step.data : [step.data];
          const filePaths = asArray.filter((p) => !!p).map((p) => String(p));
          if (!filePaths.length) {
            throw new Error(
              "upload action requires 'files' array or 'data' with a file path or array of file paths"
            );
          }
          for (const p of filePaths) {
            const resolvedPath =
              resolveFrom === "cwd" &&
              !(p.startsWith("/") || p.match(/^[A-Za-z]:\\\\/))
                ? pathMod.resolve(process.cwd(), p)
                : p;
            toUploads.push(resolvedPath);
          }
        }

        if (step.clearFirst) {
          await locator.setInputFiles([]);
        }
        await locator.setInputFiles(
          toUploads as any,
          step.actionOptions as any
        );
        break;
      }
      case "fill":
        if (locator)
          await locator.fill(
            String(step.data ?? ""),
            step.actionOptions as any
          );
        break;
      case "type":
        if (locator)
          await locator.type(
            String(step.data ?? ""),
            step.actionOptions as any
          );
        break;
      case "click":
        if (locator) await locator.click(step.actionOptions as any);
        break;
      case "hover":
        if (locator) await locator.hover(step.actionOptions as any);
        break;
      case "press":
        if (locator)
          await locator.press(
            String(step.data ?? ""),
            step.actionOptions as any
          );
        break;
      case "waitForTimeout":
        if (step.waitTime) await this.page.waitForTimeout(step.waitTime);
        break;
      case "custom":
        // @ts-ignore allow customName from JSON
        if (
          !(step as any).customName ||
          !customLogicMap[(step as any).customName]
        ) {
          throw new Error(
            `Custom action '${
              (step as any).customName
            }' not found in customLogicMap.`
          );
        }
        // @ts-ignore allow customName from JSON
        await customLogicMap[(step as any).customName](
          this.page,
          step,
          context
        );
        break;
      default:
        throw new Error(`Unsupported action: ${step.action}`);
    }
  }

  async executeValidation(
    validation: ValidationStep,
    extras: { locator?: Locator; context?: Record<string, any> } = {}
  ) {
    let locator = validation.selector
      ? this.getLocator(
          validation.selector,
          validation.selectorType as any // narrow to supported types
        )
      : extras.locator;
    if (
      locator &&
      typeof (validation as any).nth === "number" &&
      (validation as any).nth >= 0
    ) {
      locator = locator.nth((validation as any).nth as number);
    }
    const currentExpect: typeof expect = validation.soft
      ? (expect as any).soft
      : expect;
    const opts = (validation as any).expectOptions as any;

    switch (validation.type) {
      case "toBeVisible": {
        if (!locator) throw new Error("toBeVisible requires a selector");
        await currentExpect(locator, validation.message).toBeVisible(opts);
        break;
      }
      case "toBeHidden": {
        if (!locator) throw new Error("toBeHidden requires a selector");
        await currentExpect(locator, validation.message).toBeHidden(opts);
        break;
      }
      case "toHaveTitle":
        await currentExpect(this.page, validation.message).toHaveTitle(
          String(validation.data ?? ""),
          opts
        );
        break;
      case "toHaveURL":
        await currentExpect(this.page, validation.message).toHaveURL(
          new RegExp(String(validation.data ?? "")),
          opts
        );
        break;
      case "toHaveText": {
        if (!locator) throw new Error("toHaveText requires a selector");
        await currentExpect(locator, validation.message).toHaveText(
          String(validation.data ?? ""),
          opts
        );
        break;
      }
      case "toHaveValue": {
        if (!locator) throw new Error("toHaveValue requires a selector");
        await currentExpect(locator, validation.message).toHaveValue(
          String(validation.data ?? ""),
          opts
        );
        break;
      }
      case "toHaveAttribute":
        if (!validation.attribute) {
          throw new Error(
            "Validation type 'toHaveAttribute' requires an 'attribute' key."
          );
        }
        if (!locator) throw new Error("toHaveAttribute requires a selector");
        await currentExpect(locator, validation.message).toHaveAttribute(
          validation.attribute,
          String(validation.data ?? ""),
          opts
        );
        break;
      case "toHaveCSS":
        if (!validation.cssProperty) {
          throw new Error(
            "Validation type 'toHaveCSS' requires a 'cssProperty' key."
          );
        }
        if (!locator) throw new Error("toHaveCSS requires a selector");
        await currentExpect(locator, validation.message).toHaveCSS(
          validation.cssProperty,
          String(validation.data ?? ""),
          opts
        );
        break;
      case "toHaveClass": {
        if (!locator) throw new Error("toHaveClass requires a selector");
        await currentExpect(locator, validation.message).toHaveClass(
          new RegExp(String(validation.data ?? "")),
          opts
        );
        break;
      }
      case "custom": {
        // @ts-ignore allow customName on validation
        const name = (validation as any).customName;
        if (!name || !customValidationMap[name]) {
          throw new Error(
            `Custom validation '${name}' not found in customValidationMap.`
          );
        }
        await customValidationMap[name](this.page as any, validation as any, {
          locator,
          expect: currentExpect,
          ...(extras.context || {}),
        });
        break;
      }
      default:
        logger.warn(
          `Unsupported validation type: ${validation.type}`,
          "ActionExecutor"
        );
    }
  }
}
export default ActionExecutor;
