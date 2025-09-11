const { expect } = require("@playwright/test");
const { customLogicMap } = require("./custom-logic");
const { TestStep, ValidationStep } = require("./data-loader");

class ActionExecutor {
  constructor(page) {
    this.page = page;
  }

  getLocator(selector, selectorType = "css") {
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
  async executeStep(step, context = {}) {
    let locator;
    if (step.selector) {
      locator = this.getLocator(step.selector, step.selectorType);
    }

    // Support iteration if step.iterate is true and locator resolves to multiple elements
    if (step.iterate && locator) {
      const count = await locator.count();
      for (let i = 0; i < count; i++) {
        const nthLocator = locator.nth(i);
        await this._executeAction(step, nthLocator, context);
      }
    } else {
      await this._executeAction(step, locator, context);
    }

    if (step.waitTime) {
      await this.page.waitForTimeout(step.waitTime);
    }

    if (step.validations) {
      for (const validation of step.validations) {
        await this.executeValidation(validation);
      }
    }
  }

  /**
   * Internal: Executes a single action on a locator or the page.
   */
  async _executeAction(step, locator, context) {
    switch (step.action) {
      case "goto":
        await this.page.goto(step.path);
        break;
      case "fill":
        if (locator) await locator.fill(step.data);
        break;
      case "type":
        if (locator) await locator.type(step.data);
        break;
      case "click":
        if (locator) await locator.click();
        break;
      case "hover":
        if (locator) await locator.hover();
        break;
      case "press":
        if (locator) await locator.press(step.data);
        break;
      case "waitForTimeout":
        if (step.waitTime) await this.page.waitForTimeout(step.waitTime);
        break;
      case "custom":
        if (!step.customName || !customLogicMap[step.customName]) {
          throw new Error(`Custom action '${step.customName}' not found in customLogicMap.`);
        }
        await customLogicMap[step.customName](this.page, step, context);
        break;
      default:
        throw new Error(`Unsupported action: ${step.action}`);
    }
  }

  async executeValidation(validation) {
    const locator = validation.selector
      ? this.getLocator(validation.selector, validation.selectorType)
      : undefined;
    const currentExpect = validation.soft ? expect.soft : expect;

    switch (validation.type) {
      case "toBeVisible":
        await currentExpect(locator, validation.message).toBeVisible();
        break;
      case "toBeHidden":
        await currentExpect(locator, validation.message).toBeHidden();
        break;
      case "toHaveTitle":
        await currentExpect(this.page, validation.message).toHaveTitle(
          validation.data
        );
        break;
      case "toHaveURL":
        await currentExpect(this.page, validation.message).toHaveURL(
          new RegExp(validation.data)
        );
        break;
      case "toHaveText":
        await currentExpect(locator, validation.message).toHaveText(
          validation.data
        );
        break;
      case "toHaveValue":
        await currentExpect(locator, validation.message).toHaveValue(
          validation.data
        );
        break;
      case "toHaveAttribute":
        if (!validation.attribute) {
          throw new Error(
            "Validation type 'toHaveAttribute' requires an 'attribute' key."
          );
        }
        await currentExpect(locator, validation.message).toHaveAttribute(
          validation.attribute,
          validation.data
        );
        break;
      case "toHaveCSS":
        if (!validation.cssProperty) {
          throw new Error(
            "Validation type 'toHaveCSS' requires a 'cssProperty' key."
          );
        }
        await currentExpect(locator, validation.message).toHaveCSS(
          validation.cssProperty,
          validation.data
        );
        break;
      case "toHaveClass":
        await currentExpect(locator, validation.message).toHaveClass(
          new RegExp(validation.data)
        );
        break;
      default:
        console.warn(`Unsupported validation type: ${validation.type}`);
    }
  }
}
module.exports = { ActionExecutor };
