import { logger } from "./logger";

// Custom logic map for ActionExecutor
// Add your custom functions here. Each function receives (page, step, context)
// Example: 'myCustomAction': async (page, step, context) => { /* custom logic */ },
export const customLogicMap: Record<
  string,
  (page: any, step: any, context: Record<string, any>) => Promise<void>
> = {
  // 'myCustomAction': async (page, step, context) => { /* ... */ },
  queryResponse: async (page, step, context) => {
    // Example custom logic: Log the step data and context
    const textarea = page.locator(step.data.selector.fillResponse);
    if ((await textarea.count()) > 0) {
      await textarea.fill(String(step.data?.responseText ?? ""));
    }

    const done = page.locator(step.data.selector.clickDone);
    if ((await done.count()) > 0) {
      await done.click();
    }
  },
  selectWord: async (page, step, context) => {
    logger.info(
      "Executing custom logic 'selectWord'",
      "customLogic.selectWord"
    );
    if (!step.data || !step.data.word) {
      throw new Error("Step data must include a 'word' property.");
    }
    const {
      word,
      selector,
      nth = 0,
      mode = "mouse", // mouse | keyboard | auto
      method = "double", // for mouse: double | drag
      wordwise = false, // for keyboard: use word-wise selection chords
    } = step.data as {
      word: string;
      selector?: string;
      nth?: number;
      mode?: "mouse" | "keyboard" | "auto";
      method?: "double" | "drag";
      wordwise?: boolean;
    };

    // Get bounding box for the requested occurrence of the word
    const box = await page.evaluate(
      ({
        word,
        selector,
        nth,
      }: {
        word: string;
        selector?: string;
        nth: number;
      }) => {
        function findRangeForWord(
          root: Element | Document,
          word: string,
          nth: number
        ): Range | null {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          const range = document.createRange();
          let count = 0;
          let node: Node | null;
          while ((node = walker.nextNode())) {
            const txt = (node as Text).data;
            let startIndex = 0;
            while (true) {
              const idx = txt.indexOf(word, startIndex);
              if (idx === -1) break;
              if (count === nth) {
                range.setStart(node, idx);
                range.setEnd(node, idx + word.length);
                return range;
              }
              count++;
              startIndex = idx + word.length;
            }
          }
          return null;
        }

        const root: Element | Document = selector
          ? (document.querySelector(selector) as Element) || document
          : document;
        const targetRange = findRangeForWord(root, word, nth);
        if (!targetRange) return null;
        const rects = targetRange.getClientRects();
        const first = rects[0];
        const last = rects[rects.length - 1];
        const bounds = targetRange.getBoundingClientRect();
        return {
          startX: first?.left ?? bounds.left,
          startY: first?.top ?? bounds.top,
          endX: last?.right ?? bounds.right,
          endY: last?.bottom ?? bounds.bottom,
          centerX: bounds.left + bounds.width / 2,
          centerY: bounds.top + bounds.height / 2,
        };
      },
      { word, selector, nth } as {
        word: string;
        selector?: string;
        nth: number;
      }
    );

    if (!box) {
      throw new Error(
        `Word '${word}' not found${selector ? ` within '${selector}'` : ""}.`
      );
    }

    // Ensure target area is in view
    await page.mouse.move(box.centerX, box.centerY);

    const effectiveMode = mode === "auto" ? "mouse" : mode;
    if (effectiveMode === "mouse") {
      if (method === "double") {
        await page.mouse.click(box.centerX, box.centerY, { clickCount: 2 });
      } else {
        // drag selection from start to end
        await page.mouse.move(box.startX, box.startY);
        await page.mouse.down();
        await page.mouse.move(box.endX, box.endY);
        await page.mouse.up();
      }
      return;
    }

    // Keyboard selection
    // Click at start, then extend selection to the right
    await page.mouse.click(box.startX, box.startY);
    if (wordwise) {
      const plat = process.platform;
      // Word-wise selection chords differ by OS
      const chord =
        plat === "darwin"
          ? "Alt+Shift+ArrowRight"
          : plat === "win32"
          ? "Control+Shift+ArrowRight"
          : "Alt+Shift+ArrowRight";
      await page.keyboard.press(chord);
    } else {
      for (let i = 0; i < String(word).length; i++) {
        await page.keyboard.press("Shift+ArrowRight");
      }
    }
  },
};
export default customLogicMap;

// Custom validation map for ActionExecutor
// Each function should throw an Error to fail the validation, or return/resolves if it passes.
export const customValidationMap: Record<
  string,
  (page: any, validation: any, context: Record<string, any>) => Promise<void>
> = {
  // Example: Validate that an element (or entire page) contains specific text
  // Usage in JSON:
  // {
  //   "type": "custom",
  //   "customName": "containsText",
  //   "selector": ".product-name", // optional
  //   "data": "Premium Product",
  //   "message": "Product name should include Premium Product"
  // }
  async containsText(page, validation, context) {
    const targetText = String(validation.data ?? "");
    if (!targetText) {
      throw new Error(
        "Custom validation 'containsText' requires 'data' with expected substring"
      );
    }
    const loc = validation.selector ? context.locator : undefined;
    let haystack: string | null = null;
    if (loc) {
      try {
        haystack = await loc.textContent();
      } catch (e) {
        // Fallback to innerText if textContent fails
        haystack = await page.evaluate(
          (el: HTMLElement) => el.innerText,
          await loc.elementHandle()
        );
      }
    } else {
      haystack = await page.content();
    }
    haystack = haystack ?? "";
    if (!haystack.includes(targetText)) {
      const msg =
        validation.message || `Expected text to include: ${targetText}`;
      throw new Error(msg);
    }
    // Optionally also use expect if provided
    if (context.expect && loc) {
      await context.expect(haystack, validation.message).toContain(targetText);
    }
  },
};
