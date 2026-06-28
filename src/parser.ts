import type { Block, Context, ElementLike, Inline, ListItem, NodeLike, TextLike } from './options'
import {
  BlockType,
  InlineType,
  BLOCK_TAGS,
  CONTAINER_TAGS,
  ELEMENT_NODE,
  SKIP_TAG_FLAGS,
  SKIP_TAGS,
  SkipFlags,
  TEXT_NODE,
} from './options'
import {
  admonitionType,
  extractLanguage,
  findChild,
  addPendingInline,
  getCodeText,
  getTextContent,
  hasBlockChildren,
  hasLinkChildren,
  inlinesBlank,
  isInlineBlank,
  matchesCodeBy,
  processText,
} from './utils'

const INLINE_CONTAINERS = new Set(['span', 'small', 'mark', 'abbr', 'cite', 'q', 'sub', 'sup', 'time'])
const INLINE_ELEMENTS = new Set(['a', 'strong', 'b', 'em', 'i', 'code', 'span', 'img', 'br'])

// ---- admonition detection ----

export function convertAdmonition(elem: ElementLike, atype: string, ctx: Context, out: Block[]): void {
  let contentChildren: Block[] = []
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const child = ch[i]
    if (child.localName === 'div') {
      const c = child.getAttribute?.('class') ?? ''
      if (c.includes('admonitionContent')) {
        const gcNodes = child.childNodes
        for (let j = 0; j < gcNodes.length; j++) {
          convertNode(gcNodes[j], ctx, contentChildren)
        }
      }
    }
  }
  if (!contentChildren.length) return

  const firstP: Inline[] = [{ type: InlineType.text, text: `[!${atype}]` }]
  const blocks: Block[] = [{ type: BlockType.paragraph, content: firstP }, ...contentChildren]
  out.push({ type: BlockType.blockquote, children: blocks })
}

export function flushTextBatchSlots(ctx: Context): void {
  const slots = ctx.textBatchSlots
  if (!slots.length) return
  const raw = ctx.textBatchRaw
  let joined = ''
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) joined += '\x00'
    joined += raw[i]
  }
  raw.length = 0

  const processed = processText(joined)
  let start = 0
  for (let i = 0; i < slots.length; i++) {
    const idx = processed.indexOf('\x00', start)
    if (idx === -1) {
      if (start < processed.length) {
        const s = slots[i]
        const text = processed.slice(start)
        if (s.t === 'i') (s.out as Inline[])[s.idx] = { type: InlineType.text, text }
        else (s.out as Block[])[s.idx].text = text
      }
      break
    }
    if (idx > start) {
      const s = slots[i]
      const text = processed.slice(start, idx)
      if (s.t === 'i') (s.out as Inline[])[s.idx] = { type: InlineType.text, text }
      else (s.out as Block[])[s.idx].text = text
    }
    start = idx + 1
  }
  slots.length = 0
}

// ---- inline conversion ----
// All inline functions return true when any content was pushed to `out`.
// Wrapper elements (strong/em/a) check inner content for non-blank before pushing.

export function collectInlines(node: NodeLike, ctx: Context, out: Inline[]): boolean {
  let added = false
  const cn = node.childNodes
  for (let i = 0; i < cn.length; i++) {
    const child = cn[i]
    if (child.nodeType === TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text) {
        ctx.textBatchRaw.push(text)
        ctx.textBatchSlots.push({ t: 'i', out, idx: out.length })
        out.push(null as any)
        added = true
      }
    } else if (child.nodeType === ELEMENT_NODE) {
      if (convertInline(child as ElementLike, ctx, out)) added = true
    }
  }
  flushTextBatchSlots(ctx)
  return added
}

function collectInlinesWithCodeSplit(node: NodeLike, ctx: Context, out: Inline[]): void {
  let buf = ''
  function flush() {
    if (buf) { out.push({ type: InlineType.code, text: buf }); buf = '' }
  }
  const cn = node.childNodes
  for (let i = 0; i < cn.length; i++) {
    const child = cn[i]
    if (child.nodeType === TEXT_NODE) {
      buf += child.textContent ?? ''
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as ElementLike
      if (el.localName === 'a') {
        flush()
        const href = el.getAttribute?.('href') ?? ''
        const title = el.getAttribute?.('title')
        const content: Inline[] = []
        collectInlines(el, ctx, content)
        out.push({ type: InlineType.link, children: content, url: href, title })
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
}

export function convertInline(elem: ElementLike, ctx: Context, out: Inline[]): boolean {
  const tag = elem.localName

  if ((ctx.options.skip & SkipFlags.ARIA_HIDDEN) && elem.getAttribute?.('aria-hidden') === 'true') return false

  if (tag === 'strong' || tag === 'b') {
    const inner: Inline[] = []
    collectInlines(elem, ctx, inner)
    for (let i = 0; i < inner.length; i++) {
      if (!isInlineBlank(inner[i])) {
        out.push({ type: InlineType.strong, children: inner })
        return true
      }
    }
    return false
  }

  if (tag === 'i') {
    const inner: Inline[] = []
    collectInlines(elem, ctx, inner)
    for (let i = 0; i < inner.length; i++) {
      if (!isInlineBlank(inner[i])) {
        out.push({ type: InlineType.emphasis, children: inner })
        return true
      }
    }
    return false
  }

  if (tag === 'em') {
    const inner: Inline[] = []
    collectInlines(elem, ctx, inner)
    for (let i = 0; i < inner.length; i++) {
      if (!isInlineBlank(inner[i])) {
        out.push({ type: InlineType.highlight, children: inner })
        return true
      }
    }
    return false
  }

  if (tag === 'code') {
    const hasLinks = hasLinkChildren(elem)
    if (hasLinks) {
      collectInlinesWithCodeSplit(elem, ctx, out)
      return true
    }
    const text = elem.textContent ?? ''
    if (!text) return false
    out.push({ type: InlineType.code, text })
    return true
  }

  if (tag === 'a') {
    const href = elem.getAttribute?.('href') ?? ''
    const title = elem.getAttribute?.('title')
    const content: Inline[] = []
    collectInlines(elem, ctx, content)
    let nonBlank = false
    for (let i = 0; i < content.length; i++) {
      if (!isInlineBlank(content[i])) { nonBlank = true; break }
    }
    if (!nonBlank) return false
    if (!href && !title) {
      for (let i = 0; i < content.length; i++) out.push(content[i])
      return true
    }
    out.push({ type: InlineType.link, children: content, url: href, title })
    return true
  }

  if (tag === 'img') {
    const src = elem.getAttribute?.('src') ?? ''
    if (!src) return false
    const alt = elem.getAttribute?.('alt') ?? ''
    const title = elem.getAttribute?.('title')
    out.push({ type: InlineType.image, alt, url: src, title })
    return true
  }

  if (tag === 'br') {
    out.push({ type: InlineType.linebreak })
    return true
  }

  if (tag === 'figcaption') {
    const inner: Inline[] = []
    collectInlines(elem, ctx, inner)
    for (let i = 0; i < inner.length; i++) {
      if (!isInlineBlank(inner[i])) {
        out.push({ type: InlineType.emphasis, children: inner })
        return true
      }
    }
    return false
  }

  if (tag === 'address') {
    const inner: Inline[] = []
    collectInlines(elem, ctx, inner)
    for (let i = 0; i < inner.length; i++) {
      if (!isInlineBlank(inner[i])) {
        out.push({ type: InlineType.strong, children: inner })
        return true
      }
    }
    return false
  }

  if (tag === 'ul') {
    collectListInlines(elem, '-', ctx, out)
    return true
  }

  if (tag === 'ol') {
    const start = parseInt(elem.getAttribute?.('start') ?? '1', 10)
    collectOrderedListInlines(elem, start, ctx, out)
    return true
  }

  // pass-through inline containers
  if (INLINE_CONTAINERS.has(tag)) {
    collectInlines(elem, ctx, out)
    return true
  }

  return collectInlines(elem, ctx, out)
}

function collectListInlines(elem: ElementLike, marker: string, ctx: Context, out: Inline[]): void {
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const li = ch[i]
    if (li.localName !== 'li') continue
    if (out.length) out.push({ type: InlineType.linebreak })
    out.push({ type: InlineType.text, text: marker + ' ' })
    collectInlines(li, ctx, out)
  }
}

function collectOrderedListInlines(elem: ElementLike, start: number, ctx: Context, out: Inline[]): void {
  let n = start
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const li = ch[i]
    if (li.localName !== 'li') continue
    if (out.length) out.push({ type: InlineType.linebreak })
    out.push({ type: InlineType.text, text: n + '. ' })
    collectInlines(li, ctx, out)
    n++
  }
}

// ---- block conversion ----



export function convertNode(node: NodeLike, ctx: Context, out: Block[]): void {
  switch (node.nodeType) {
    case TEXT_NODE: {
      const text = node.textContent
      if (!text) return
      const trimmed = text.trim()
      if (!trimmed) return
      ctx.textBatchRaw.push(text)
      ctx.textBatchSlots.push({ t: 'b', out, idx: out.length })
      out.push({ type: BlockType.paragraph, text: '' })
      return
    }
    case ELEMENT_NODE:
      convertElement(node as ElementLike, ctx, out)
  }
}

export function convertElement(elem: ElementLike, ctx: Context, out: Block[]): void {
  const tag = elem.localName

  if (SKIP_TAGS.has(tag)) return

  if ((ctx.options.skip & SkipFlags.ARIA_HIDDEN) && elem.getAttribute?.('aria-hidden') === 'true') return

  const tagFlag = SKIP_TAG_FLAGS[tag]
  if (tagFlag != null && (ctx.options.skip & tagFlag)) return

  // code-by matched element
  if (matchesCodeBy(elem, ctx.options.codeBy)) {
    convertCodeByElement(elem, ctx, out)
    return
  }

  // admonition
  if (tag === 'div') {
    const cls = elem.getAttribute?.('class') ?? ''
    const atype = admonitionType(cls)
    if (atype) { convertAdmonition(elem, atype, ctx, out); return }
  }

  switch (tag) {
    case 'p': {
      const inlines: Inline[] = []
      collectInlines(elem, ctx, inlines)
      if (inlines.length && !inlinesBlank(inlines)) {
        out.push({ type: BlockType.paragraph, content: inlines })
      }
      return
    }

    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = parseInt(tag[1], 10)
      const inlines: Inline[] = []
      collectInlines(elem, ctx, inlines)
      if (inlines.length && !inlinesBlank(inlines)) {
        out.push({ type: BlockType.heading, level, content: inlines })
      }
      return
    }

    case 'blockquote': {
      const children: Block[] = []
      convertChildren(elem, ctx, children)
      if (children.length) {
        out.push({ type: BlockType.blockquote, children })
      }
      return
    }

    case 'ul': {
      const items = collectListItems(elem, ctx)
      if (items.length) out.push({ type: BlockType.list, ordered: false, items, start: 1 })
      return
    }

    case 'ol': {
      const startStr = elem.getAttribute?.('start')
      const start = startStr ? parseInt(startStr, 10) : 1
      const items = collectListItems(elem, ctx)
      if (items.length) out.push({ type: BlockType.list, ordered: true, items, start })
      return
    }

    case 'pre': {
      const codeEl = findChild(elem, 'code')
      if (codeEl) {
        const codeText = getCodeText(codeEl)
        if (!codeText.trim()) return
        const lang = extractLanguage(elem) || extractLanguage(codeEl)
        out.push({ type: BlockType.codeblock, language: lang, code: codeText, fenced: true })
      } else {
        const text = getCodeText(elem)
        if (!text.trim()) return
        out.push({ type: BlockType.codeblock, language: extractLanguage(elem), code: text, fenced: false })
      }
      return
    }

    case 'hr':
      out.push({ type: BlockType.hr })
      return

    case 'table':
      convertTable(elem, ctx, out)
      return

    default:
      break
  }

  // container elements (div, section, etc.)
  if (CONTAINER_TAGS.has(tag)) {
    if (hasBlockChildren(elem)) {
      convertChildren(elem, ctx, out)
    } else {
      const inlines: Inline[] = []
      collectInlines(elem, ctx, inlines)
      if (inlines.length && !inlinesBlank(inlines)) {
        out.push({ type: BlockType.paragraph, content: inlines })
      }
    }
    return
  }

  // figcaption, address handled as inline wrappers at block level
  if (tag === 'figcaption') {
    const inlines: Inline[] = []
    collectInlines(elem, ctx, inlines)
    if (inlines.length && !inlinesBlank(inlines)) {
      out.push({ type: BlockType.paragraph, content: [{ type: InlineType.emphasis, children: inlines }] })
    }
    return
  }

  if (tag === 'address') {
    const inlines: Inline[] = []
    collectInlines(elem, ctx, inlines)
    if (inlines.length && !inlinesBlank(inlines)) {
      out.push({ type: BlockType.paragraph, content: [{ type: InlineType.strong, children: inlines }] })
    }
    return
  }

  // inline elements at block level
  if (INLINE_ELEMENTS.has(tag)) {
    const inlines: Inline[] = []
    if (convertInline(elem, ctx, inlines)) {
      out.push({ type: BlockType.paragraph, content: inlines })
    }
    return
  }

  // unknown - try children
  convertChildren(elem, ctx, out)
}

export function convertCodeByElement(elem: ElementLike, ctx: Context, out: Block[]): void {
  const tag = elem.localName
  const inlines: Inline[] = []
  collectInlinesWithCodeSplit(elem, ctx, inlines)
  if (inlines.length <= 0) return

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      out.push({ type: BlockType.heading, level: parseInt(tag[1], 10), content: inlines })
      break
    default:
      out.push({ type: BlockType.paragraph, content: inlines })
      break
  }
}

export function convertChildren(elem: ElementLike, ctx: Context, out: Block[]): void {
  const cn = elem.childNodes
  for (let i = 0; i < cn.length; i++) {
    convertNode(cn[i], ctx, out)
  }
}

// ---- lists ----

function collectListItems(elem: ElementLike, ctx: Context): ListItem[] {
  const items: ListItem[] = []
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const child = ch[i]
    if (child.localName === 'li') {
      const hasBlocks = hasBlockChildrenExceptLi(child)
      let blocks: Block[]
      if (hasBlocks) {
        blocks = collectContentWithInlineMerge(child, ctx)
      } else {
        const inlines: Inline[] = []
        collectInlines(child, ctx, inlines)
        blocks = inlines.length && !inlinesBlank(inlines) ? [{ type: BlockType.paragraph, content: inlines }] : []
      }
      items.push({ blocks })
    }
  }
  return items
}

function collectContentWithInlineMerge(elem: ElementLike, ctx: Context): Block[] {
  const blocks: Block[] = []
  let pending: Inline[] | null = null
  const cn = elem.childNodes
  for (let i = 0; i < cn.length; i++) {
    const child = cn[i]
    if (child.nodeType === TEXT_NODE) {
      const text = child.textContent ?? ''
      if (!text.trim()) {
        addPendingInline(blocks, pending);
        pending = null;
        continue
      }
      if (!pending) pending = []
      ctx.textBatchRaw.push(text)
      ctx.textBatchSlots.push({ t: 'i', out: pending, idx: pending.length })
      pending.push(null as any)
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as ElementLike
      if (BLOCK_TAGS.has(el.localName) && el.localName !== 'li') {
        addPendingInline(blocks, pending)
        pending = null
        convertElement(el, ctx, blocks)
      } else {
        const inner: Inline[] = []
        if (convertInline(el, ctx, inner)) {
          if (!pending) pending = []
          for (let i = 0; i < inner.length; i++) pending.push(inner[i])
        }
      }
    } else {
      addPendingInline(blocks, pending)
      pending = null
    }
  }
  addPendingInline(blocks, pending)
  return blocks
}

function hasBlockChildrenExceptLi(elem: ElementLike): boolean {
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const t = ch[i].localName
    if (t === 'ul' || t === 'ol') return true
    if (BLOCK_TAGS.has(t) && t !== 'li') return true
  }
  return false
}

// ---- tables ----

export function convertTable(elem: ElementLike, ctx: Context, out: Block[]): void {
  const headers: Inline[][] = []
  const rows: Inline[][][] = []

  let directTrs: ElementLike[] = []
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const child = ch[i]
    const t = child.localName
    if (t === 'thead') {
      const trs = child.children
      for (let j = 0; j < trs.length; j++) {
        if (trs[j].localName === 'tr') readRow(trs[j], headers, rows, ctx)
        break
      }
    } else if (t === 'tbody') {
      const trs = child.children
      for (let j = 0; j < trs.length; j++) {
        if (trs[j].localName === 'tr') readRow(trs[j], headers, rows, ctx)
      }
    } else if (t === 'tr') {
      directTrs.push(child)
    }
  }

  for (let i = 0; i < directTrs.length; i++) {
    readRow(directTrs[i], headers, rows, ctx)
  }

  if (!headers.length && rows.length) {
    const first = rows.shift()!
    for (let i = 0; i < first.length; i++) headers.push(first[i])
  }

  if (headers.length || rows.length) {
    out.push({ type: BlockType.table, headers, rows })
  }
}

function readRow(tr: ElementLike, headers: Inline[][], rows: Inline[][][], ctx: Context): void {
  const row: Inline[][] = []
  let hadHeader = false
  const cells = tr.children
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const cellInlines: Inline[] = []
    collectInlines(cell, ctx, cellInlines)

    if (cell.localName === 'th') hadHeader = true
    row.push(cellInlines)
  }
  if (!row.length) return
  if (hadHeader && !headers.length) {
    for (let i = 0; i < row.length; i++) headers.push(row[i])
  } else {
    rows.push(row)
  }
}
