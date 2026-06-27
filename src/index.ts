export const HOIST_IMAGES = 1 << 0
export const HOIST_LINKS = 1 << 1

export const SkipFlags = {
  NONE: 0,
  ARIA_HIDDEN: 1 << 0,
  HEADER: 1 << 1,
  FOOTER: 1 << 2,
  ASIDE: 1 << 3,
  NAV: 1 << 4,
  MENU: 1 << 5,
} as const

export interface HtmlToMdOptions {
  headingStyle?: 'atx' | 'setext'
  codeBlockStyle?: 'fenced' | 'indented'
  bulletListMarker?: string
  hr?: string
  emDelimiter?: string
  strongDelimiter?: string
  fence?: string
  codeBy?: string[]
  flags?: number
  skip?: number
}

interface CodeByRule {
  tag: string | null
  class: string | null
}

interface ImageRef {
  ref: string
  title?: string
}

interface ResolvedOptions {
  headingStyle: 'atx' | 'setext'
  codeBlockStyle: 'fenced' | 'indented'
  bulletListMarker: string
  hr: string
  emDelimiter: string
  strongDelimiter: string
  fence: string
  codeBy: CodeByRule[]
  flags: number
  skip: number
  hoisted: Map<string, ImageRef>
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'table',
  'ul', 'ol', 'li',
  'div', 'section', 'article', 'main',
  'aside', 'header', 'footer', 'nav',
  'figure', 'figcaption', 'address',
  'form', 'fieldset', 'hr',
])

const SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'template',
  'form', 'fieldset',
  'button', 'input', 'select', 'textarea', 'option',
  'head',
])

const CONTAINER_TAGS = new Set([
  'div', 'section', 'article', 'main',
  'aside', 'header', 'footer', 'nav', 'figure',
])

function resolveOptions(opts?: HtmlToMdOptions): ResolvedOptions {
  return {
    headingStyle: opts?.headingStyle ?? 'atx',
    codeBlockStyle: opts?.codeBlockStyle ?? 'fenced',
    bulletListMarker: opts?.bulletListMarker ?? '-',
    hr: opts?.hr ?? '---',
    emDelimiter: opts?.emDelimiter ?? '_',
    strongDelimiter: opts?.strongDelimiter ?? '**',
    fence: opts?.fence ?? '```',
    codeBy: (opts?.codeBy ?? []).map(parseCodeByRule),
    flags: opts?.flags ?? 0,
    skip: opts?.skip ?? 0,
    hoisted: new Map(),
  }
}

function escapeMarkdown(text: string): string {
  let out = ''
  for (const c of text) {
    if ('\\*_[]#+-!`'.includes(c)) out += '\\' + c
    else out += c
  }
  return out
}

function collapseWhitespace(s: string): string {
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

function isBlockTag(tag: string): boolean {
  return BLOCK_TAGS.has(tag)
}

function isSkipTag(tag: string): boolean {
  return SKIP_TAGS.has(tag)
}

function isContainerTag(tag: string): boolean {
  return CONTAINER_TAGS.has(tag)
}

// ---- code-by rule parsing ----

function parseCodeByRule(s: string): CodeByRule {
  const dot = s.indexOf('.')
  if (dot === -1) {
    if (s.startsWith('.')) return { tag: null, class: s.slice(1) }
    return { tag: s, class: null }
  }
  const tag = dot === 0 ? null : s.slice(0, dot)
  const cls = s.slice(dot + 1)
  return { tag: tag || null, class: cls || null }
}

function matchesCodeBy(elem: Element, rules: CodeByRule[]): boolean {
  const tag = elem.localName
  const cls = elem.getAttribute('class')
  return rules.some(r => {
    if (r.tag && tag !== r.tag) return false
    if (r.class && (!cls || !cls.split(/\s+/).includes(r.class))) return false
    return true
  })
}

// ---- linkedom lazy load ----

let _parseHtml: ((html: string) => Document) | undefined | null

function ensureParser(): (html: string) => Document {
  if (_parseHtml === undefined) {
    try {
      const { DOMParser } = require('linkedom')
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
  }
  if (!_parseHtml) throw new Error(
    'html2md-js: string input requires linkedom. ' +
    'Install: npm install linkedom, or pass an Element directly.'
  )
  return _parseHtml
}

// ---- admonition detection ----

function admonitionType(cls: string): string | null {
  if (cls.includes('theme-admonition-note') || cls.includes('theme-admonition-info')) return 'NOTE'
  if (cls.includes('theme-admonition-tip')) return 'TIP'
  if (cls.includes('theme-admonition-important')) return 'IMPORTANT'
  if (cls.includes('theme-admonition-warning')) return 'WARNING'
  if (cls.includes('theme-admonition-danger') || cls.includes('theme-admonition-caution')) return 'CAUTION'
  return null
}

function convertAdmonition(elem: Element, atype: string, ctx: Context): Block[] {
  let contentChildren: Block[] = []
  for (const child of elem.children) {
    if (child.localName === 'div') {
      const c = child.getAttribute('class') ?? ''
      if (c.includes('admonitionContent')) {
        for (const gc of child.childNodes) {
          const blocks = convertNode(gc, ctx)
          contentChildren.push(...blocks)
        }
      }
    }
  }
  if (!contentChildren.length) return []
  const firstP: Inline[] = [{ type: 'text', text: `[!${atype}]` }]
  const blocks: Block[] = [blockParagraph(firstP), ...contentChildren]
  return [blockBlockQuote(blocks)]
}

// ---- language propagation ----

function propagateLanguage(pre: Element): void {
  const preClass = pre.getAttribute('class') ?? ''
  const lang = preClass.split(/\s+/).find(s => s.startsWith('language-'))
  if (!lang) return
  for (const child of pre.children) {
    if (child.localName === 'code') {
      const existing = child.getAttribute('class') ?? ''
      if (!existing.split(/\s+/).includes(lang)) {
        child.setAttribute('class', existing ? `${existing} ${lang}` : lang)
      }
    }
  }
}

// ---- AST types ----

interface Block {
  type: 'document' | 'heading' | 'paragraph' | 'blockquote' | 'list' | 'codeblock' | 'hr' | 'table'
  level?: number
  content?: Inline[]
  children?: Block[]
  ordered?: boolean
  start?: number
  items?: ListItem[]
  language?: string
  code?: string
  fenced?: boolean
  headers?: Inline[][]
  rows?: Inline[][][]
}

interface ListItem {
  blocks: Block[]
}

interface Inline {
  type: 'text' | 'strong' | 'emphasis' | 'code' | 'link' | 'image' | 'linebreak' | 'highlight'
  text?: string
  children?: Inline[]
  url?: string
  title?: string
  alt?: string
}

function blockParagraph(content: Inline[]): Block {
  return { type: 'paragraph', content }
}

function blockBlockQuote(children: Block[]): Block {
  return { type: 'blockquote', children }
}

function blockList(ordered: boolean, items: ListItem[], start?: number): Block {
  return { type: 'list', ordered, items, start: start ?? 1 }
}

function blockCodeBlock(language: string | undefined, code: string, fenced: boolean): Block {
  return { type: 'codeblock', language, code, fenced }
}

// ---- Context ----

interface Context {
  options: ResolvedOptions
  inList: boolean
}

function makeCtx(opts: ResolvedOptions): Context {
  return { options: opts, inList: false }
}

// ---- block/inline detection ----

function hasBlockChildren(elem: Element): boolean {
  for (const child of elem.children) {
    if (isBlockTag(child.localName)) return true
  }
  return false
}

// ---- text extraction helpers ----

function getTextContent(node: Node): string {
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

// ========== INLINE CONVERSION ==========

type InlineResult = Inline[]

function collectInlines(node: Node, ctx: Context): InlineResult {
  const result: Inline[] = []
  for (const child of node.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      const text = (child as Text).textContent ?? ''
      const collapsed = collapseWhitespace(text)
      if (collapsed) result.push({ type: 'text', text: escapeMarkdown(collapsed) })
    } else if (child.nodeType === ELEMENT_NODE) {
      const inline = convertInline(child as Element, ctx)
      if (inline) result.push(...inline)
    }
  }
  return result
}

function collectInlinesWithCodeSplit(node: Node, ctx: Context): InlineResult {
  const result: Inline[] = []
  let buf = ''
  function flush() {
    if (buf) { result.push({ type: 'code', text: buf }); buf = '' }
  }
  for (const child of node.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      buf += (child as Text).textContent ?? ''
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element
      if (el.localName === 'a') {
        flush()
        const href = el.getAttribute('href') ?? ''
        const title = el.getAttribute('title') ?? undefined
        const content = collectInlines(el, ctx)
        result.push({ type: 'link', children: content, url: href, title })
      } else if (el.localName === 'br') {
        buf += '\n'
      } else if (el.localName === 'code') {
        buf += el.textContent ?? ''
      } else {
        buf += getTextContent(el)
      }
    }
  }
  flush()
  return result
}

function convertInline(elem: Element, ctx: Context): InlineResult | null {
  const tag = elem.localName

  if ((ctx.options.skip & SkipFlags.ARIA_HIDDEN) && elem.getAttribute('aria-hidden') === 'true') return null

  if (tag === 'strong' || tag === 'b') {
    const inner = collectInlines(elem, ctx)
    if (inner.every(i => isInlineBlank(i))) return null
    return [{ type: 'strong', children: inner }]
  }

  if (tag === 'i') {
    const inner = collectInlines(elem, ctx)
    if (inner.every(i => isInlineBlank(i))) return null
    return [{ type: 'emphasis', children: inner }]
  }

  if (tag === 'em') {
    const inner = collectInlines(elem, ctx)
    if (inner.every(i => isInlineBlank(i))) return null
    return [{ type: 'highlight', children: inner }]
  }

  if (tag === 'code') {
    const hasLinks = hasLinkChildren(elem)
    if (hasLinks) return collectInlinesWithCodeSplit(elem, ctx)
    const text = elem.textContent ?? ''
    if (!text) return null
    return [{ type: 'code', text }]
  }

  if (tag === 'a') {
    const href = elem.getAttribute('href') ?? ''
    const title = elem.getAttribute('title') ?? undefined
    const content = collectInlines(elem, ctx)
    if (content.every(i => isInlineBlank(i))) return null
    if (!href && !title) {
      return content
    }
    return [{ type: 'link', children: content, url: href, title }]
  }

  if (tag === 'img') {
    const src = elem.getAttribute('src') ?? ''
    if (!src) return null
    const alt = elem.getAttribute('alt') ?? ''
    const title = elem.getAttribute('title') ?? undefined
    return [{ type: 'image', alt, url: src, title }]
  }

  if (tag === 'br') {
    return [{ type: 'linebreak' }]
  }

  if (tag === 'figcaption') {
    const inner = collectInlines(elem, ctx)
    if (inner.every(i => isInlineBlank(i))) return null
    return [{ type: 'emphasis', children: inner }]
  }

  if (tag === 'address') {
    const inner = collectInlines(elem, ctx)
    if (inner.every(i => isInlineBlank(i))) return null
    return [{ type: 'strong', children: inner }]
  }

  if (tag === 'ul') {
    return collectListInlines(elem, '-', ctx)
  }

  if (tag === 'ol') {
    const start = parseInt(elem.getAttribute('start') ?? '1', 10)
    return collectOrderedListInlines(elem, start, ctx)
  }

  // pass-through inline containers
  if (['span', 'small', 'mark', 'abbr', 'cite', 'q', 'sub', 'sup', 'time'].includes(tag)) {
    return collectInlines(elem, ctx)
  }

  return collectInlines(elem, ctx)
}

function collectListInlines(elem: Element, marker: string, ctx: Context): Inline[] {
  const result: Inline[] = []
  for (const li of elem.children) {
    if (li.localName !== 'li') continue
    if (result.length) result.push({ type: 'linebreak' })
    const content = collectInlines(li, ctx)
    result.push({ type: 'text', text: marker + ' ' })
    result.push(...content)
  }
  return result
}

function collectOrderedListInlines(elem: Element, start: number, ctx: Context): Inline[] {
  const result: Inline[] = []
  let n = start
  for (const li of elem.children) {
    if (li.localName !== 'li') continue
    if (result.length) result.push({ type: 'linebreak' })
    const content = collectInlines(li, ctx)
    result.push({ type: 'text', text: n + '. ' })
    result.push(...content)
    n++
  }
  return result
}

function hasLinkChildren(elem: Element): boolean {
  for (const child of elem.children) {
    if (child.localName === 'a') return true
    if (hasLinkChildren(child)) return true
  }
  return false
}

function isInlineBlank(i: Inline): boolean {
  switch (i.type) {
    case 'text': return !i.text || !i.text.trim()
    case 'strong': case 'emphasis': case 'highlight': return !i.children || i.children.every(isInlineBlank)
    case 'code': return !i.text
    case 'link': return !i.children || i.children.every(isInlineBlank)
    case 'image': return false
    case 'linebreak': return false
  }
}

function inlinesBlank(inlines: Inline[]): boolean {
  return inlines.every(isInlineBlank)
}

// ========== BLOCK CONVERSION ==========

function convertNode(node: Node, ctx: Context): Block[] {
  if (node.nodeType === TEXT_NODE) {
    const text = (node as Text).textContent ?? ''
    if (!text.trim()) return []
    const inlines: Inline[] = [{ type: 'text', text: escapeMarkdown(collapseWhitespace(text)) }]
    return [blockParagraph(inlines)]
  }
  if (node.nodeType === ELEMENT_NODE) {
    return convertElement(node as Element, ctx)
  }
  return []
}

function convertElement(elem: Element, ctx: Context): Block[] {
  const tag = elem.localName

  if (isSkipTag(tag)) return []

  if ((ctx.options.skip & SkipFlags.ARIA_HIDDEN) && elem.getAttribute('aria-hidden') === 'true') return []

  const SKIP_TAG_FLAGS: Record<string, number> = {
    header: SkipFlags.HEADER,
    footer: SkipFlags.FOOTER,
    aside: SkipFlags.ASIDE,
    nav: SkipFlags.NAV,
    menu: SkipFlags.MENU,
  }
  const tagFlag = SKIP_TAG_FLAGS[tag]
  if (tagFlag !== undefined && (ctx.options.skip & tagFlag)) return []

  // code-by matched element
  if (matchesCodeBy(elem, ctx.options.codeBy)) {
    return convertCodeByElement(elem, ctx)
  }

  // admonition
  if (tag === 'div') {
    const cls = elem.getAttribute('class') ?? ''
    const atype = admonitionType(cls)
    if (atype) return convertAdmonition(elem, atype, ctx)
  }

  switch (tag) {
    case 'p': {
      const inlines = collectInlines(elem, ctx)
      if (inlinesBlank(inlines)) return []
      return [blockParagraph(inlines)]
    }

    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const level = parseInt(tag[1], 10)
      const inlines = collectInlines(elem, ctx)
      if (inlinesBlank(inlines)) return []
      return [{ type: 'heading', level, content: inlines }]
    }

    case 'blockquote': {
      const blocks = convertChildren(elem, ctx)
      if (!blocks.length) return []
      return [blockBlockQuote(blocks)]
    }

    case 'ul': {
      const items = collectListItems(elem, ctx)
      if (!items.length) return []
      return [blockList(false, items)]
    }

    case 'ol': {
      const startStr = elem.getAttribute('start')
      const start = startStr ? parseInt(startStr, 10) : 1
      const items = collectListItems(elem, ctx)
      if (!items.length) return []
      return [blockList(true, items, start)]
    }

    case 'pre': {
      propagateLanguage(elem)
      const codeEl = findChild(elem, 'code')
      if (codeEl) {
        const codeText = getCodeText(codeEl)
        const lang = extractLanguage(codeEl)
        return [blockCodeBlock(lang, codeText, true)]
      }
      const text = getCodeText(elem)
      return [blockCodeBlock(undefined, text, false)]
    }

    case 'hr':
      return [{ type: 'hr' }]

    case 'table':
      return convertTable(elem, ctx)

    default:
      break
  }

  // container elements (div, section, etc.)
  if (isContainerTag(tag)) {
    if (hasBlockChildren(elem)) {
      return convertChildren(elem, ctx)
    }
    const inlines = collectInlines(elem, ctx)
    if (inlinesBlank(inlines)) return []
    return [blockParagraph(inlines)]
  }

  // figcaption, address handled as inline wrappers at block level
  if (tag === 'figcaption') {
    const inlines = collectInlines(elem, ctx)
    if (inlinesBlank(inlines)) return []
    return [blockParagraph([{ type: 'emphasis', children: inlines }])]
  }

  if (tag === 'address') {
    const inlines = collectInlines(elem, ctx)
    if (inlinesBlank(inlines)) return []
    return [blockParagraph([{ type: 'strong', children: inlines }])]
  }

  // inline elements at block level
  if (['a', 'strong', 'b', 'em', 'i', 'code', 'span', 'img', 'br'].includes(tag)) {
    const result = convertInline(elem, ctx)
    if (!result || inlinesBlank(result)) return []
    return [blockParagraph(result)]
  }

  // unknown - try children
  return convertChildren(elem, ctx)
}

function convertCodeByElement(elem: Element, ctx: Context): Block[] {
  const tag = elem.localName

  // Determine the "envelope" for this element (heading, paragraph, etc.)
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
    const level = parseInt(tag[1], 10)
    const inlines = collectInlinesWithCodeSplit(elem, ctx)
    if (inlinesBlank(inlines)) return []
    return [{ type: 'heading', level, content: inlines }]
  }

  if (tag === 'p' || tag === 'div' || tag === 'span') {
    const inlines = collectInlinesWithCodeSplit(elem, ctx)
    if (inlinesBlank(inlines)) return []
    return [blockParagraph(inlines)]
  }

  // Default: process with code split, wrap in paragraph
  const inlines = collectInlinesWithCodeSplit(elem, ctx)
  if (inlinesBlank(inlines)) return []
  return [blockParagraph(inlines)]
}

function findChild(elem: Element, tag: string): Element | null {
  for (const child of elem.children) {
    if (child.localName === tag) return child
  }
  return null
}

function getCodeText(elem: Element): string {
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

function extractLanguage(elem: Element): string | undefined {
  const cls = elem.getAttribute('class') ?? ''
  const lang = cls.split(/\s+/).find(s => s.startsWith('language-'))
  return lang ? lang.slice(9) : undefined
}

function convertChildren(elem: Element, ctx: Context): Block[] {
  const blocks: Block[] = []
  for (const child of elem.childNodes) {
    blocks.push(...convertNode(child, ctx))
  }
  return blocks
}

// ---- lists ----

function collectListItems(elem: Element, ctx: Context): ListItem[] {
  const items: ListItem[] = []
  for (const child of elem.children) {
    if (child.localName === 'li') {
      const hasBlocks = hasBlockChildrenExceptLi(child)
      let blocks: Block[]
      if (hasBlocks) {
        blocks = collectContentWithInlineMerge(child, ctx)
      } else {
        const inlines = collectInlines(child, ctx)
        blocks = inlinesBlank(inlines) ? [] : [blockParagraph(inlines)]
      }
      items.push({ blocks })
    }
  }
  return items
}

function collectContentWithInlineMerge(elem: Element, ctx: Context): Block[] {
  const blocks: Block[] = []
  let pending: Inline[] | null = null
  for (const child of elem.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      const text = (child as Text).textContent ?? ''
      if (!text.trim()) { flushPendingInline(blocks, pending); pending = null; continue }
      if (!pending) pending = []
      pending.push({ type: 'text', text: escapeMarkdown(collapseWhitespace(text)) })
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as Element
      if (isBlockTag(el.localName) && el.localName !== 'li') {
        flushPendingInline(blocks, pending)
        pending = null
        blocks.push(...convertElement(el, ctx))
      } else {
        const result = convertInline(el, ctx)
        if (result && result.length > 0) {
          if (!pending) pending = []
          pending.push(...result)
        }
      }
    } else {
      flushPendingInline(blocks, pending)
      pending = null
    }
  }
  flushPendingInline(blocks, pending)
  return blocks
}

function flushPendingInline(blocks: Block[], pending: Inline[] | null) {
  if (pending && pending.length > 0) {
    blocks.push(blockParagraph(pending))
  }
}

function hasBlockChildrenExceptLi(elem: Element): boolean {
  for (const child of elem.children) {
    const t = child.localName
    if (t === 'ul' || t === 'ol') return true
    if (BLOCK_TAGS.has(t) && t !== 'li') return true
  }
  return false
}

// ---- tables ----

function convertTable(elem: Element, ctx: Context): Block[] {
  const headers: Inline[][] = []
  const rows: Inline[][][] = []

  // Process thead, tbody, and direct tr children
  let directTrs: Element[] = []
  for (const child of elem.children) {
    const t = child.localName
    if (t === 'thead') {
      for (const tr of child.children) {
        if (tr.localName === 'tr') readRow(tr, true, headers, rows)
        break
      }
    } else if (t === 'tbody') {
      for (const tr of child.children) {
        if (tr.localName === 'tr') readRow(tr, false, headers, rows)
      }
    } else if (t === 'tr') {
      directTrs.push(child)
    }
  }

  for (const tr of directTrs) {
    readRow(tr, headers.length === 0, headers, rows)
  }

  // If no headers, promote first row
  if (!headers.length && rows.length) {
    const first = rows.shift()!
    headers.push(...first)
  }

  if (!headers.length && !rows.length) return []
  return [{ type: 'table', headers, rows }]
}

function readRow(tr: Element, _isHeader: boolean, headers: Inline[][], rows: Inline[][][]): void {
  const row: Inline[][] = []
  let hadHeader = false
  for (const cell of tr.children) {
    const t = cell.localName
    if (t === 'th') { hadHeader = true; row.push(collectInlines(cell, makeCtx(resolveOptions()))) }
    else if (t === 'td') { row.push(collectInlines(cell, makeCtx(resolveOptions()))) }
  }
  if (!row.length) return
  if (hadHeader && !headers.length) {
    headers.push(...row)
  } else {
    rows.push(row)
  }
}

// ========== SERIALIZATION ==========

function serializeBlock(block: Block, opts: ResolvedOptions, depth: number): string {
  switch (block.type) {
    case 'document':
      return serializeBlocks(block.children ?? [], opts, depth)

    case 'heading':
      return serializeHeading(block.level!, block.content!, opts)

    case 'paragraph':
      return serializeParagraph(block.content ?? [], opts)

    case 'blockquote':
      return serializeBlockQuote(block.children ?? [], opts, depth)

    case 'list':
      return serializeList(block.ordered!, block.start ?? 1, block.items ?? [], opts, depth)

    case 'codeblock':
      return serializeCodeBlock(block.language, block.code ?? '', block.fenced ?? true, opts)

    case 'hr':
      return opts.hr + '\n\n'

    case 'table':
      return serializeTable(block.headers ?? [], block.rows ?? [], opts)

    default:
      return ''
  }
}

function serializeBlocks(blocks: Block[], opts: ResolvedOptions, depth: number): string {
  let out = ''
  for (const b of blocks) {
    if (isBlockBlank(b)) continue
    out += serializeBlock(b, opts, depth)
  }
  return out
}

function serializeHeading(level: number, content: Inline[], opts: ResolvedOptions): string {
  let text = serializeInlines(content, opts)
  if (!text.trim()) return ''
  if (opts.headingStyle === 'setext' && level <= 2) {
    let underline = level === 1 ? '=' : '-'
    return text + '\n' + underline.repeat(text.length) + '\n\n'
  }
  return '#'.repeat(level) + ' ' + text + '\n\n'
}

function serializeParagraph(content: Inline[], opts: ResolvedOptions): string {
  let text = serializeInlines(content, opts)
  if (!text.trim()) return ''
  return text + '\n\n'
}

function serializeBlockQuote(blocks: Block[], opts: ResolvedOptions, depth: number): string {
  let content = serializeBlocks(blocks, opts, depth)
  content = content.trimEnd()
  if (!content) return ''
  let lines = content.split('\n')
  let out = lines.map((line, i) => {
    if (i > 0 && line.startsWith('>')) return line
    return '> ' + (line.startsWith('>') ? '' : line)
  }).join('\n')
  return out + '\n\n'
}

function serializeList(ordered: boolean, start: number, items: ListItem[], opts: ResolvedOptions, depth: number): string {
  let indent = '  '.repeat(depth)
  let out = ''
  for (let i = 0; i < items.length; i++) {
    out += indent
    if (ordered) {
      let num = start + i
      out += num + '.  '
    } else {
      out += opts.bulletListMarker + ' '
    }
    let prefixLen = ordered ? (start + i).toString().length + 3 : 2
    out += serializeListItem(items[i], opts, depth + 1, prefixLen, indent)
  }
  out += '\n'
  return out
}

function serializeListItem(item: ListItem, opts: ResolvedOptions, _depth: number, _prefixLen: number, _indent: string): string {
  let content = ''
  for (let i = 0; i < item.blocks.length; i++) {
    const b = item.blocks[i]
    const next = i < item.blocks.length - 1 ? item.blocks[i + 1] : null
    if (b.type === 'paragraph') {
      content += serializeInlines(b.content ?? [], opts)
      if (next && next.type === 'list') content += '\n'
      else if (next) content += '\n\n'
    } else if (b.type === 'list') {
      content += serializeBlock(b, opts, _depth)
    } else {
      content += serializeBlock(b, opts, _depth)
    }
  }
  return content + '\n'
}

function serializeCodeBlock(language: string | undefined, code: string, fenced: boolean, opts: ResolvedOptions): string {
  let useFenced = fenced || opts.codeBlockStyle === 'fenced'
  if (useFenced) {
    return opts.fence + (language ?? '') + '\n' + code + '\n' + opts.fence + '\n\n'
  }
  return code.split('\n').map(l => '    ' + l).join('\n') + '\n\n'
}

function serializeTable(headers: Inline[][], rows: Inline[][][], opts: ResolvedOptions): string {
  if (!headers.length && !rows.length) return ''

  let colCount = headers.length
  for (const row of rows) {
    if (row.length > colCount) colCount = row.length
  }

  const cell = (text: string) => {
    if (text) return ' ' + text
    return ''
  }

  let out = '|'
  for (let i = 0; i < colCount; i++) {
    let text = i < headers.length ? serializeInlines(headers[i], opts) : ''
    out += cell(text) + ' |'
  }
  out += '\n|'
  for (let i = 0; i < colCount; i++) {
    out += ' --- |'
  }
  out += '\n'

  for (const row of rows) {
    out += '|'
    for (let i = 0; i < colCount; i++) {
      let content = i < row.length ? row[i] : []
      let text = serializeInlines(content, opts)
      out += cell(text) + ' |'
    }
    out += '\n'
  }
  out += '\n'
  return out
}

// ---- inline serialization ----

function serializeInlines(inlines: Inline[], opts: ResolvedOptions): string {
  let out = ''
  for (const i of inlines) {
    out += serializeInline(i, opts)
  }
  return out
}

function serializeInline(inline: Inline, opts: ResolvedOptions): string {
  switch (inline.type) {
    case 'text':
      return inline.text ?? ''

    case 'strong': {
      let inner = serializeInlines(inline.children ?? [], opts)
      if (!inner.trim()) return ''
      return opts.strongDelimiter + inner + opts.strongDelimiter
    }

    case 'emphasis': {
      let inner = serializeInlines(inline.children ?? [], opts)
      if (!inner.trim()) return ''
      return opts.emDelimiter + inner + opts.emDelimiter
    }

    case 'highlight': {
      let inner = serializeInlines(inline.children ?? [], opts)
      if (!inner.trim()) return ''
      return '==' + inner + '=='
    }

    case 'code': {
      let text = inline.text ?? ''
      if (!text) return ''
      let bt = text.includes('`') ? '``' : '`'
      let space = (text.startsWith('`') || text.endsWith('`')) ? ' ' : ''
      return bt + space + text + space + bt
    }

    case 'link': {
      let content = serializeInlines(inline.children ?? [], opts)
      let url = inline.url ?? ''
      if (opts.flags & HOIST_LINKS && url) {
        let ref = opts.hoisted.get(url)
        if (!ref) {
          let title = inline.title && inline.title !== content ? inline.title : undefined
          ref = { ref: 'ref' + opts.hoisted.size, title }
          opts.hoisted.set(url, ref)
        }
        return '[' + content + '][' + ref.ref + ']'
      }
      let out = '[' + content + '](' + url
      if (inline.title && inline.title !== content) out += ' "' + inline.title + '"'
      out += ')'
      return out
    }

    case 'image': {
      let alt = inline.alt ?? ''
      let url = inline.url ?? ''
      let title = inline.title
      if (opts.flags & HOIST_IMAGES) {
        let ref = opts.hoisted.get(url)
        if (!ref) {
          ref = { ref: 'img' + opts.hoisted.size, title }
          opts.hoisted.set(url, ref)
        }
        return '![' + alt + '][' + ref.ref + ']'
      }
      let out = '![' + alt + '](' + url
      if (title) out += ' "' + title + '"'
      out += ')'
      return out
    }

    case 'linebreak':
      return '  \n'

    default:
      return ''
  }
}

// ---- helpers ----

function isBlockBlank(block: Block): boolean {
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

function collapseTrim(s: string): string {
  let bytes = [...s]
  let start = 0, end = bytes.length
  while (start < end && bytes[start] === '\n') start++
  while (end > start && bytes[end - 1] === '\n') end--
  let out: string[] = []
  let newlineCount = 0
  for (let i = start; i < end; i++) {
    if (bytes[i] === '\n') {
      newlineCount++
      if (newlineCount <= 2) out.push('\n')
    } else {
      newlineCount = 0
      out.push(bytes[i])
    }
  }
  return out.join('')
}

function postProcess(md: string): string {
  md = md.replace(/\s*\[​\]\(#[^)]+\)/g, '')
  md = md.replace(/\\-/g, '-')
  return md
}

// ========== MAIN ENTRY ==========

export function htmlToMd(input: Element | string, options?: HtmlToMdOptions): string {
  const opts = resolveOptions(options)

  let element: Element
  if (typeof input === 'string') {
    const parser = ensureParser()
    const doc = parser(input)
    element = doc.body
  } else {
    element = input
  }

  const ctx = makeCtx(opts)
  const blocks = convertChildren(element, ctx)
  let result = serializeBlocks(blocks, opts, 0)
  result = collapseTrim(result)
  result = postProcess(result)

  // append hoisted definitions
  if ((opts.flags & (HOIST_IMAGES | HOIST_LINKS)) && opts.hoisted.size) {
    let footer = '\n\n'
    for (const [url, ref] of opts.hoisted) {
      footer += '[' + ref.ref + ']: ' + url
      if (ref.title) footer += ' "' + ref.title + '"'
      footer += '\n'
    }
    result += footer
  }

  return result
}
