import {
  type Inline,
  type Block,
  type ListItem,
  type Context,
  type ResolvedOptions,
  type CodeByRule,
  BLOCK_TAGS,
  SKIP_TAGS,
  CONTAINER_TAGS,
  ELEMENT_NODE,
  TEXT_NODE,
  SkipFlags,
} from './options.ts'

const ESCAPE_CHARS = new Set(['\\', '*', '_', '[', ']', '#', '+', '-', '!', '`'])

export function escapeMarkdown(text: string): string {
  let out = ''
  for (const c of text) {
    if (ESCAPE_CHARS.has(c)) out += '\\' + c
    else out += c
  }
  return out
}

export function collapseWhitespace(s: string): string {
  let out = ''
  let prevSpace = false
  for (const c of s) {
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
      if (!prevSpace) { out += ' '; prevSpace = true }
    } else {
      out += c
      prevSpace = false
    }
  }
  return out
}

export function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag)
}

export function isSkipTag(tag: string): boolean {
  return SKIP_TAGS.has(tag)
}

export function isContainerTag(tag: string): boolean {
  return CONTAINER_TAGS.has(tag)
}

export function matchesCodeBy(elem: Element, rules: CodeByRule[]): boolean {
  const tag = elem.localName
  const rawCls = elem.getAttribute('class')
  const classes = rawCls ? rawCls.split(/\s+/) : null
  return rules.some(r => {
    if (r.tag && tag !== r.tag) return false
    if (r.class && (!classes || !classes.includes(r.class))) return false
    return true
  })
}

type HtmlParser = (html: string) => any

let _parseHtml: HtmlParser | undefined | null

try {
  const { DOMParser } = await import('linkedom')
  const parser = new DOMParser()
  _parseHtml = (html: string) => {
    const trimmed = html.trimStart()
    const isFullDoc = trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')
    if (!isFullDoc) {
      html = '<html><body>' + html + '</body></html>'
    }
    return parser.parseFromString(html, 'text/html')
  }
} catch {
  _parseHtml = null
}

export function ensureParser(): HtmlParser {
  if (!_parseHtml) throw new Error(
    'html2md-js: string input requires linkedom. ' +
    'Install: npm install linkedom, or pass an Element directly.'
  )
  return _parseHtml
}

const ADMONITION_MAP: Record<string, string> = {
  'theme-admonition-note': 'NOTE',
  'theme-admonition-info': 'NOTE',
  'theme-admonition-tip': 'TIP',
  'theme-admonition-important': 'IMPORTANT',
  'theme-admonition-warning': 'WARNING',
  'theme-admonition-danger': 'CAUTION',
  'theme-admonition-caution': 'CAUTION',
}

export function admonitionType(cls: string): string | null {
  for (const token of cls.split(/\s+/)) {
    const mapped = ADMONITION_MAP[token]
    if (mapped) return mapped
  }
  return null
}

export function hasBlockChildren(elem: Element): boolean {
  for (const child of elem.children) {
    if (isBlockTag(child.localName)) return true
  }
  return false
}

export function getTextContent(node: Node): string {
  if (node.nodeType === TEXT_NODE) return (node as Text).textContent ?? ''
  let out = ''
  for (const child of (node as Element).childNodes) {
    if (child.nodeType === TEXT_NODE) out += (child as Text).textContent ?? ''
    else if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element
      if (el.localName === 'br') out += '\n'
      else out += getTextContent(el)
    }
  }
  return out
}

export function hasLinkChildren(elem: Element): boolean {
  for (const child of elem.children) {
    if (child.localName === 'a') return true
    if (hasLinkChildren(child)) return true
  }
  return false
}

export function isInlineBlank(i: Inline): boolean {
  switch (i.type) {
    case 'text': return !i.text || !i.text.trim()
    case 'strong': case 'emphasis': case 'highlight': return !i.children || i.children.every(isInlineBlank)
    case 'code': return !i.text
    case 'link': return !i.children || i.children.every(isInlineBlank)
    case 'image': return false
    case 'linebreak': return false
  }
}

export function inlinesBlank(inlines: Inline[]): boolean {
  return inlines.every(isInlineBlank)
}

export function isBlockBlank(block: Block): boolean {
  switch (block.type) {
    case 'document': return block.children?.every(isBlockBlank) ?? true
    case 'paragraph': return block.content?.every(isInlineBlank) ?? true
    case 'heading': return block.content?.every(isInlineBlank) ?? true
    case 'blockquote': return block.children?.every(isBlockBlank) ?? true
    case 'list': return block.items?.every(i => i.blocks.every(isBlockBlank)) ?? true
    case 'codeblock': return !block.code?.trim()
    case 'table':
      return (block.headers?.every(h => h.every(isInlineBlank)) ?? true)
        && (block.rows?.every(r => r.every(c => c.every(isInlineBlank))) ?? true)
    case 'hr': return false
  }
}

export function findChild(elem: Element, tag: string): Element | null {
  for (const child of elem.children) {
    if (child.localName === tag) return child
  }
  return null
}

export function getCodeText(elem: Element): string {
  let out = ''
  for (const child of elem.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      out += (child as Text).textContent ?? ''
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element
      if (el.localName === 'br') out += '\n'
      else out += getCodeText(el)
    }
  }
  return out
}

export function extractLanguage(elem: Element): string | undefined {
  const cls = elem.getAttribute('class') ?? ''
  const lang = cls.split(/\s+/).find(s => s.startsWith('language-'))
  return lang ? lang.slice(9) : undefined
}

export function flushPendingInline(blocks: Block[], pending: Inline[] | null) {
  if (pending && pending.length > 0) {
    blocks.push(blockParagraph(pending))
  }
}

export function collapseTrim(s: string): string {
  let start = 0, end = s.length
  while (start < end && s[start] === '\n') start++
  while (end > start && s[end - 1] === '\n') end--
  let out: string[] = []
  let newlineCount = 0
  for (let i = start; i < end; i++) {
    if (s[i] === '\n') {
      newlineCount++
      if (newlineCount <= 2) out.push('\n')
    } else {
      newlineCount = 0
      out.push(s[i])
    }
  }
  return out.join('')
}

export function postProcess(md: string): string {
  md = md.replace(/\s*\[​\]\(#[^)]+\)/g, '')
  md = md.replace(/\\-/g, '-')
  return md
}

export function blockParagraph(content: Inline[]): Block {
  return { type: 'paragraph', content }
}

export function blockBlockQuote(children: Block[]): Block {
  return { type: 'blockquote', children }
}

export function blockList(ordered: boolean, items: ListItem[], start?: number): Block {
  return { type: 'list', ordered, items, start: start ?? 1 }
}

export function blockCodeBlock(language: string | undefined, code: string, fenced: boolean): Block {
  return { type: 'codeblock', language, code, fenced }
}
