# 07 — XPath & DOM Interaction Patterns

> How to find, click, and interact with DOM elements in injected scripts.

---

## SDK XPath Methods

The `marco.xpath` module provides cached XPath evaluation:

```javascript
// Get a named XPath expression
const xpath = await marco.xpath.get("chatBox");

// Resolve to DOM element (synchronous — uses cache)
const el = marco.xpath.resolve("chatBox");
if (el) {
    el.click();
}

// Resolve all matching elements
const items = marco.xpath.resolveAll("listItems");

// Refresh cache if XPaths changed at runtime
await marco.xpath.refreshCache();
```

## XPath Utilities (Global)

The `xpath` project (`standalone-scripts/xpath/`) provides global utility functions available on `window`:

### `getByXPath(expression, context?)`

Evaluate an XPath expression and return the first matching element.

```javascript
const el = getByXPath("//button[contains(text(), 'Submit')]");
```

### `getAllByXPath(expression, context?)`

Return all matching elements as an array.

```javascript
const buttons = getAllByXPath("//button[@class='action']");
```

### `findElement(options)`

Multi-method element search with fallback chain:

```javascript
const el = findElement({
    xpath: "//div[@id='main']",
    selector: "#main",
    text: "Main Content",
    timeout: 5000,
});
```

Search order: XPath → CSS selector → text content → timeout.

### `reactClick(element)`

Perform a React-compatible synthetic click that triggers React's event system:

```javascript
const btn = getByXPath("//button[@data-action='save']");
if (btn) {
    reactClick(btn);
}
```

This dispatches `mousedown`, `mouseup`, and `click` events with proper bubbling to ensure React's synthetic event system detects the interaction.

## Waiting for Dynamic DOM

Use `marco.utils.waitForElement()` for elements that load asynchronously:

```javascript
// Wait for element by CSS selector
const el = await marco.utils.waitForElement({
    selector: "#dynamic-content",
    timeoutMs: 10000,
    intervalMs: 200,
});

// Wait for element by XPath
const el2 = await marco.utils.waitForElement({
    selector: "//div[@data-loaded='true']",
    useXPath: true,
    timeoutMs: 5000,
});
```

## Polling Patterns

For conditions beyond element presence:

```javascript
// Poll until a condition is truthy
const result = await marco.utils.pollUntil(
    () => document.querySelector("#status")?.textContent === "Ready" ? true : null,
    { timeoutMs: 15000, intervalMs: 500 },
);
```

## Retry Patterns

For flaky operations (network, DOM race conditions):

```javascript
const data = await marco.utils.withRetry(
    async () => {
        const el = getByXPath("//span[@class='balance']");
        if (!el) throw new Error("Element not found");
        return el.textContent;
    },
    {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
        onRetry: (attempt, err) => console.log(`Retry ${attempt}:`, err),
    },
);
```

## Common XPath Patterns

| Pattern | XPath |
|---------|-------|
| Button by text | `//button[contains(text(), 'Save')]` |
| Input by placeholder | `//input[@placeholder='Enter name']` |
| Element by class | `//div[contains(@class, 'sidebar')]` |
| Nth child | `(//li[@class='item'])[3]` |
| Parent traversal | `//span[@id='label']/..` |
| Attribute contains | `//*[contains(@data-id, 'prefix')]` |
| Text exact match | `//*[text()='Exact Text']` |
