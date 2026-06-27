import type { Block, Context, ElementLike, Inline, ListItem, NodeLike, TextLike } from './options'
import {
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
  collapseWhitespace,
  escapeMarkdown,
  extractLanguage,
  findChild,
  flushPendingInline,
  getCodeText,
  getTextContent,
  hasBlockChildren,
  hasLinkChildren,
  inlinesBlank,
  isInlineBlank,
  matchesCodeBy
} from './utils'

// ---- admonition detection ----

function convertAdmonition(elem: ElementLike, atype: string, ctx: Context, out: Block[]): void {
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
  const firstP: Inline[] = [{ type: 'text', text: `[!${atype}]` }]
  const blocks: Block[] = [{ type: 'paragraph', content: firstP }, ...contentChildren]
  out.push({ type: 'blockquote', children: blocks })
}

// ---- inline conversion ----
// All inline functions return true when any content was pushed to `out`.
// Wrapper elements (strong/em/a) check inner content for non-blank before pushing.

function collectInlines(node: NodeLike, ctx: Context, out: Inline[]): boolean {
  let added = false
  const cn = node.childNodes
  for (let i = 0; i < cn.length; i++) {
    const child = cn[i]
    if (child.nodeType === TEXT_NODE) {
      const text = (child as TextLike).textContent ?? ''
      const collapsed = collapseWhitespace(text)
      if (collapsed) {
        out.push({ type: 'text', text: escapeMarkdown(collapsed) })
        added = true
      }
    } else if (child.nodeType === ELEMENT_NODE) {
      if (convertInline(child as ElementLike, ctx, out)) added = true
    }
  }
  return added
}

function collectInlinesWithCodeSplit(node: NodeLike, ctx: Context, out: Inline[]): void {
  let buf = ''
  function flush() {
    if (buf) { out.push({ type: 'code', text: buf }); buf = '' }
  }
  const cn = node.childNodes
  for (let i = 0; i < cn.length; i++) {
    const child = cn[i]
    if (child.nodeType === TEXT_NODE) {
      buf += (child as TextLike).textContent ?? ''
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as ElementLike
      if (el.localName === 'a') {
        flush()
        const href = el.getAttribute?.('href') ?? ''
        const title = el.getAttribute?.('title') ?? undefined
        const content: Inline[] = []
        collectInlines(el, ctx, content)
        out.push({ type: 'link', children: content, url: href, title })
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

function convertInline(elem: ElementLike, ctx: Context, out: Inline[]): boolean {
  const tag = elem.localName

  if ((ctx.options.skip & SkipFlags.ARIA_HIDDEN) && elem.getAttribute?.('aria-hidden') === 'true') return false

  if (tag === 'strong' || tag === 'b') {
    const inner: Inline[] = []
    collectInlines(elem, ctx, inner)
    for (let i = 0; i < inner.length; i++) {
      if (!isInlineBlank(inner[i])) {
        out.push({ type: 'strong', children: inner })
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
        out.push({ type: 'emphasis', children: inner })
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
        out.push({ type: 'highlight', children: inner })
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
    out.push({ type: 'code', text })
    return true
  }

  if (tag === 'a') {
    const href = elem.getAttribute?.('href') ?? ''
    const title = elem.getAttribute?.('title') ?? undefined
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
    out.push({ type: 'link', children: content, url: href, title })
    return true
  }

  if (tag === 'img') {
    const src = elem.getAttribute?.('src') ?? ''
    if (!src) return false
    const alt = elem.getAttribute?.('alt') ?? ''
    const title = elem.getAttribute?.('title') ?? undefined
    out.push({ type: 'image', alt, url: src, title })
    return true
  }

  if (tag === 'br') {
    out.push({ type: 'linebreak' })
    return true
  }

  if (tag === 'figcaption') {
    const inner: Inline[] = []
    collectInlines(elem, ctx, inner)
    for (let i = 0; i < inner.length; i++) {
      if (!isInlineBlank(inner[i])) {
        out.push({ type: 'emphasis', children: inner })
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
        out.push({ type: 'strong', children: inner })
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
  if (['span', 'small', 'mark', 'abbr', 'cite', 'q', 'sub', 'sup', 'time'].includes(tag)) {
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
    if (out.length) out.push({ type: 'linebreak' })
    out.push({ type: 'text', text: marker + ' ' })
    collectInlines(li, ctx, out)
  }
}

function collectOrderedListInlines(elem: ElementLike, start: number, ctx: Context, out: Inline[]): void {
  let n = start
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const li = ch[i]
    if (li.localName !== 'li') continue
    if (out.length) out.push({ type: 'linebreak' })
    out.push({ type: 'text', text: n + '. ' })
    collectInlines(li, ctx, out)
    n++
  }
}

// ---- block conversion ----

function convertNode(node: NodeLike, ctx: Context, out: Block[]): void {
  if (node.nodeType === TEXT_NODE) {
    const text = (node as TextLike).textContent ?? ''
    const trimmed = text.trim()
    if (!trimmed) return
    out.push({ type: 'paragraph', content: [{ type: 'text', text: escapeMarkdown(collapseWhitespace(text)) }] })
    return
  }
  if (node.nodeType === ELEMENT_NODE) {
    convertElement(node as ElementLike, ctx, out)
  }
}

function convertElement(elem: ElementLike, ctx: Context, out: Block[]): void {
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
        out.push({ type: 'paragraph', content: inlines })
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
        out.push({ type: 'heading', level, content: inlines })
      }
      return
    }

    case 'blockquote': {
      const children: Block[] = []
      convertChildren(elem, ctx, children)
      if (children.length) {
        out.push({ type: 'blockquote', children })
      }
      return
    }

    case 'ul': {
      const items = collectListItems(elem, ctx)
      if (items.length) out.push({ type: 'list', ordered: false, items, start: 1 })
      return
    }

    case 'ol': {
      const startStr = elem.getAttribute?.('start')
      const start = startStr ? parseInt(startStr, 10) : 1
      const items = collectListItems(elem, ctx)
      if (items.length) out.push({ type: 'list', ordered: true, items, start })
      return
    }

    case 'pre': {
      const codeEl = findChild(elem, 'code')
      if (codeEl) {
        const codeText = getCodeText(codeEl)
        const lang = extractLanguage(elem) || extractLanguage(codeEl)
        out.push({ type: 'codeblock', language: lang, code: codeText, fenced: true })
      } else {
        const text = getCodeText(elem)
        out.push({ type: 'codeblock', language: extractLanguage(elem), code: text, fenced: false })
      }
      return
    }

    case 'hr':
      out.push({ type: 'hr' })
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
        out.push({ type: 'paragraph', content: inlines })
      }
    }
    return
  }

  // figcaption, address handled as inline wrappers at block level
  if (tag === 'figcaption') {
    const inlines: Inline[] = []
    collectInlines(elem, ctx, inlines)
    if (inlines.length && !inlinesBlank(inlines)) {
      out.push({ type: 'paragraph', content: [{ type: 'emphasis', children: inlines }] })
    }
    return
  }

  if (tag === 'address') {
    const inlines: Inline[] = []
    collectInlines(elem, ctx, inlines)
    if (inlines.length && !inlinesBlank(inlines)) {
      out.push({ type: 'paragraph', content: [{ type: 'strong', children: inlines }] })
    }
    return
  }

  // inline elements at block level
  if (['a', 'strong', 'b', 'em', 'i', 'code', 'span', 'img', 'br'].includes(tag)) {
    const inlines: Inline[] = []
    if (convertInline(elem, ctx, inlines)) {
      out.push({ type: 'paragraph', content: inlines })
    }
    return
  }

  // unknown - try children
  convertChildren(elem, ctx, out)
}

function convertCodeByElement(elem: ElementLike, ctx: Context, out: Block[]): void {
  const tag = elem.localName

  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
    const level = parseInt(tag[1], 10)
    const inlines: Inline[] = []
    collectInlinesWithCodeSplit(elem, ctx, inlines)
    if (inlines.length) out.push({ type: 'heading', level, content: inlines })
    return
  }

  if (tag === 'p' || tag === 'div' || tag === 'span') {
    const inlines: Inline[] = []
    collectInlinesWithCodeSplit(elem, ctx, inlines)
    if (inlines.length) out.push({ type: 'paragraph', content: inlines })
    return
  }

  const inlines: Inline[] = []
  collectInlinesWithCodeSplit(elem, ctx, inlines)
  if (inlines.length) out.push({ type: 'paragraph', content: inlines })
}

function convertChildren(elem: ElementLike, ctx: Context, out: Block[]): void {
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
        blocks = inlines.length && !inlinesBlank(inlines) ? [{ type: 'paragraph', content: inlines }] : []
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
      const text = (child as TextLike).textContent ?? ''
      if (!text.trim()) { flushPendingInline(blocks, pending); pending = null; continue }
      if (!pending) pending = []
      pending.push({ type: 'text', text: escapeMarkdown(collapseWhitespace(text)) })
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as ElementLike
      if (BLOCK_TAGS.has(el.localName) && el.localName !== 'li') {
        flushPendingInline(blocks, pending)
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
      flushPendingInline(blocks, pending)
      pending = null
    }
  }
  flushPendingInline(blocks, pending)
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

function convertTable(elem: ElementLike, ctx: Context, out: Block[]): void {
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
    out.push({ type: 'table', headers, rows })
  }
}

function readRow(tr: ElementLike, headers: Inline[][], rows: Inline[][][], ctx: Context): void {
  const row: Inline[][] = []
  let hadHeader = false
  const cells = tr.children
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const t = cell.localName
    const cellInlines: Inline[] = []
    collectInlines(cell, ctx, cellInlines)
    if (t === 'th') { hadHeader = true; row.push(cellInlines) }
    else if (t === 'td') { row.push(cellInlines) }
  }
  if (!row.length) return
  if (hadHeader && !headers.length) {
    for (let i = 0; i < row.length; i++) headers.push(row[i])
  } else {
    rows.push(row)
  }
}

export { collectInlines, convertAdmonition, convertChildren, convertCodeByElement, convertElement, convertInline, convertNode, convertTable }
