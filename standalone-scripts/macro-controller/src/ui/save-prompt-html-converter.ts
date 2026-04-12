/**
 * MacroLoop Controller — HTML to Markdown Converter
 *
 * Converts editor HTML content to simple Markdown for prompt saving.
 * Extracted from save-prompt.ts during Phase 5 module splitting.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

/** Convert editor HTML to simple markdown. */
export function htmlToMarkdown(element: HTMLElement): string {
  let markdown = '';
  const childNodes = element.childNodes;

  for (const node of Array.from(childNodes)) {
    const isTextNode = node.nodeType === 3;

    if (isTextNode) {
      markdown += node.textContent;
      continue;
    }

    const isElementNode = node.nodeType === 1;

    if (isElementNode) {
      markdown += convertElementToMarkdown(node as HTMLElement);
    }
  }

  return markdown.replace(/\n{3,}/g, '\n\n').trim();
}

function convertElementToMarkdown(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase();
  const text = element.textContent || '';

  const converter = TAG_CONVERTERS[tag];
  const hasConverter = converter !== undefined;

  if (hasConverter) {
    return converter(element, text);
  }

  return text;
}

type TagConverter = (element: HTMLElement, text: string) => string;

const TAG_CONVERTERS: Record<string, TagConverter> = {
  p: (element) => htmlToMarkdown(element) + '\n\n',
  div: (element) => htmlToMarkdown(element) + '\n\n',
  br: () => '\n',
  strong: (_el, text) => '**' + text + '**',
  b: (_el, text) => '**' + text + '**',
  em: (_el, text) => '*' + text + '*',
  i: (_el, text) => '*' + text + '*',
  code: (_el, text) => '`' + text + '`',
  pre: (element, text) => convertPreBlock(element, text),
  ul: (element) => convertList(element, 'ul'),
  ol: (element) => convertList(element, 'ol'),
  li: (_el, text) => '- ' + text.trim() + '\n',
  h1: (_el, text) => '# ' + text + '\n\n',
  h2: (_el, text) => '## ' + text + '\n\n',
  h3: (_el, text) => '### ' + text + '\n\n',
  a: (element, text) => '[' + text + '](' + ((element as HTMLAnchorElement).href || '') + ')',
  blockquote: (_el, text) => '> ' + text.trim() + '\n\n',
};

function convertPreBlock(element: HTMLElement, fallbackText: string): string {
  const codeElement = element.querySelector('code');
  let language = '';

  const hasCodeElement = codeElement !== null;

  if (hasCodeElement && codeElement.className) {
    const languageMatch = codeElement.className.match(/language-(\w+)/);
    const hasLanguageMatch = languageMatch !== null;
    if (hasLanguageMatch) {
      language = languageMatch[1];
    }
  }

  const content = hasCodeElement ? codeElement.textContent : fallbackText;
  return '```' + language + '\n' + content + '\n```\n\n';
}

function convertList(element: HTMLElement, listType: 'ul' | 'ol'): string {
  const items = element.querySelectorAll(':scope > li');
  let markdown = '';

  for (const [itemIndex, item] of Array.from(items).entries()) {
    const isOrdered = listType === 'ol';
    const prefix = isOrdered ? ((itemIndex + 1) + '. ') : '- ';
    markdown += prefix + item.textContent!.trim() + '\n';
  }

  return markdown + '\n';
}
