import type { Block, Context, ElementLike, ListItem, NodeLike } from './options'
import {
  BlockType,
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
  getCodeText,
  getTextContent,
  hasBlockChildren,
  hasLinkChildren,
  matchesCodeBy,
  processText,
} from './utils'

const INLINE_CONTAINERS = new Set(['span', 'small', 'mark', 'abbr', 'cite', 'q', 'sub', 'sup', 'time'])
const INLINE_ELEMENTS = new Set(['a', 'strong', 'b', 'em', 'i', 'code', 'span', 'img', 'br'])

// ---- text batching ----

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
        s.out[s.idx] = text
      }
      break
    }
    if (idx > start) {
      const s = slots[i]
      s.out[s.idx] = processed.slice(start, idx)
    }
    start = idx + 1
  }
  slots.length = 0
}

// ---- inline → string conversion ----

function collectInlineText(node: NodeLike, ctx: Context): string {
  const out: string[] = []
  const cn = node.childNodes
  for (let i = 0; i < cn.length; i++) {
    const child = cn[i]
    if (child.nodeType === TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text) {
        ctx.textBatchRaw.push(text)
        ctx.textBatchSlots.push({ out, idx: out.length })
        out.push('')
      }
    } else if (child.nodeType === ELEMENT_NODE) {
      convertInlineText(child as ElementLike, ctx, out)
    }
  }
  flushTextBatchSlots(ctx)
  return out.length ? out.join('') : ''
}

function collectCodeSplitText(node: NodeLike, ctx: Context, out: string[]): void {
  let buf = ''
  function flush() {
    if (buf) {
      const bt = buf.includes('`') ? '``' : '`'
      const space = (buf.startsWith('`') || buf.endsWith('`')) ? ' ' : ''
      out.push(bt, space, buf, space, bt)
      buf = ''
    }
  }
  const opts = ctx.options
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
        const title = el.getAttribute?.('title') ?? undefined
        const content = collectInlineText(el, ctx)
        if (opts.flags & (1 << 1) && href) {
          const ref = opts.hoisted.addLink(href, content, title).ref
          out.push('[', content, '][', ref, ']')
        } else {
          out.push('[', content, '](', href)
          if (title) out.push(' "', title, '"')
          out.push(')')
        }
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

function convertInlineText(elem: ElementLike, ctx: Context, out: string[]): boolean {
  const tag = elem.localName

  if ((ctx.options.skip & SkipFlags.ARIA_HIDDEN) && elem.getAttribute?.('aria-hidden') === 'true') return false

  if (tag === 'strong' || tag === 'b') {
    const text = collectInlineText(elem, ctx)
    if (!text.trim()) return false
    out.push(ctx.options.strongDelimiter, text, ctx.options.strongDelimiter)
    return true
  }

  if (tag === 'i') {
    const text = collectInlineText(elem, ctx)
    if (!text.trim()) return false
    out.push(ctx.options.emDelimiter, text, ctx.options.emDelimiter)
    return true
  }

  if (tag === 'em') {
    const text = collectInlineText(elem, ctx)
    if (!text.trim()) return false
    out.push('==', text, '==')
    return true
  }

  if (tag === 'code') {
    const hasLinks = hasLinkChildren(elem)
    if (hasLinks) {
      collectCodeSplitText(elem, ctx, out)
      return true
    }
    const text = elem.textContent ?? ''
    if (!text) return false
    const bt = text.includes('`') ? '``' : '`'
    const space = (text.startsWith('`') || text.endsWith('`')) ? ' ' : ''
    out.push(bt, space, text, space, bt)
    return true
  }

  if (tag === 'a') {
    const href = elem.getAttribute?.('href') ?? ''
    const title = elem.getAttribute?.('title') ?? undefined
    const text = collectInlineText(elem, ctx)
    if (!text.trim()) return false
    const opts = ctx.options
    if (!href && !title) { out.push(text); return true }
    if (opts.flags & (1 << 1) && href) {
      const ref = opts.hoisted.addLink(href, text, title).ref
      out.push('[', text, '][', ref, ']')
    } else {
      out.push('[', text, '](', href)
      if (title && title !== text) out.push(' "', title, '"')
      out.push(')')
    }
    return true
  }

  if (tag === 'img') {
    const src = elem.getAttribute?.('src') ?? ''
    if (!src) return false
    const alt = elem.getAttribute?.('alt') ?? ''
    const title = elem.getAttribute?.('title') ?? undefined
    const opts = ctx.options
    if (opts.flags & (1 << 0)) {
      const ref = opts.hoisted.addImage(src, title).ref
      out.push('![', alt, '][', ref, ']')
    } else {
      out.push('![', alt, '](', src)
      if (title) out.push(' "', title, '"')
      out.push(')')
    }
    return true
  }

  if (tag === 'br') {
    out.push('  \n')
    return true
  }

  if (tag === 'figcaption') {
    const text = collectInlineText(elem, ctx)
    if (!text.trim()) return false
    out.push('_', text, '_')
    return true
  }

  if (tag === 'address') {
    const text = collectInlineText(elem, ctx)
    if (!text.trim()) return false
    out.push('**', text, '**')
    return true
  }

  if (tag === 'ul') {
    collectInlineList(elem, '-', ctx, out)
    return true
  }

  if (tag === 'ol') {
    const start = parseInt(elem.getAttribute?.('start') ?? '1', 10)
    collectInlineOrderedList(elem, start, ctx, out)
    return true
  }

  if (INLINE_CONTAINERS.has(tag) || INLINE_ELEMENTS.has(tag)) {
    const text = collectInlineText(elem, ctx)
    if (text) out.push(text)
    return !!text
  }

  const text = collectInlineText(elem, ctx)
  if (text) out.push(text)
  return !!text
}

function collectInlineList(elem: ElementLike, marker: string, ctx: Context, out: string[]): void {
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const li = ch[i]
    if (li.localName !== 'li') continue
    if (out.length) out.push('  \n')
    out.push(marker, ' ')
    const text = collectInlineText(li, ctx)
    out.push(text)
  }
}

function collectInlineOrderedList(elem: ElementLike, start: number, ctx: Context, out: string[]): void {
  let n = start
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const li = ch[i]
    if (li.localName !== 'li') continue
    if (out.length) out.push('  \n')
    out.push(String(n), '. ')
    const text = collectInlineText(li, ctx)
    out.push(text)
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
      const processed = processText(text)
      if (processed.trim()) {
        out.push({ type: BlockType.paragraph, text: processed })
      }
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

  if (matchesCodeBy(elem, ctx.options.codeBy)) {
    convertCodeByElement(elem, ctx, out)
    return
  }

  if (tag === 'div') {
    const cls = elem.getAttribute?.('class') ?? ''
    const atype = admonitionType(cls)
    if (atype) { convertAdmonition(elem, atype, ctx, out); return }
  }

  switch (tag) {
    case 'p': {
      const text = collectInlineText(elem, ctx)
      if (text.trim()) out.push({ type: BlockType.paragraph, text })
      return
    }

    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = parseInt(tag[1], 10)
      const text = collectInlineText(elem, ctx)
      if (text.trim()) out.push({ type: BlockType.heading, level, text })
      return
    }

    case 'blockquote': {
      const children: Block[] = []
      convertChildren(elem, ctx, children)
      if (children.length) out.push({ type: BlockType.blockquote, children })
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

  if (CONTAINER_TAGS.has(tag)) {
    if (hasBlockChildren(elem)) {
      convertChildren(elem, ctx, out)
    } else {
      const text = collectInlineText(elem, ctx)
      if (text.trim()) out.push({ type: BlockType.paragraph, text })
    }
    return
  }

  if (tag === 'figcaption') {
    const text = collectInlineText(elem, ctx)
    if (text.trim()) out.push({ type: BlockType.paragraph, text: '_' + text + '_' })
    return
  }

  if (tag === 'address') {
    const text = collectInlineText(elem, ctx)
    if (text.trim()) out.push({ type: BlockType.paragraph, text: '**' + text + '**' })
    return
  }

  if (INLINE_ELEMENTS.has(tag)) {
    const acc: string[] = []
    if (convertInlineText(elem, ctx, acc)) {
      out.push({ type: BlockType.paragraph, text: acc.join('') })
    }
    return
  }

  convertChildren(elem, ctx, out)
}

function convertCodeByElement(elem: ElementLike, ctx: Context, out: Block[]): void {
  const acc: string[] = []
  collectCodeSplitText(elem, ctx, acc)
  if (!acc.length) return

  const text = acc.join('')
  const tag = elem.localName
  if (tag >= 'h1' && tag <= 'h6') {
    const level = parseInt(tag[1], 10)
    out.push({ type: BlockType.heading, level, text })
  } else {
    out.push({ type: BlockType.paragraph, text })
  }
}

export function convertChildren(elem: ElementLike, ctx: Context, out: Block[]): void {
  const cn = elem.childNodes
  for (let i = 0; i < cn.length; i++) {
    convertNode(cn[i], ctx, out)
  }
}

// ---- admonition ----

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

  const firstP = { type: BlockType.paragraph, text: `[!${atype}]` }
  const blocks: Block[] = [firstP, ...contentChildren]
  out.push({ type: BlockType.blockquote, children: blocks })
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
        blocks = collectListItemBlocks(child, ctx)
      } else {
        const text = collectInlineText(child, ctx)
        blocks = text.trim() ? [{ type: BlockType.paragraph, text }] : []
      }
      items.push({ blocks })
    }
  }
  return items
}

function collectListItemBlocks(elem: ElementLike, ctx: Context): Block[] {
  const blocks: Block[] = []
  const pending: string[] = []

  function flushPending() {
    flushTextBatchSlots(ctx)
    const text = pending.join('')
    if (text.trim()) blocks.push({ type: BlockType.paragraph, text })
    pending.length = 0
  }

  const cn = elem.childNodes
  for (let i = 0; i < cn.length; i++) {
    const child = cn[i]
    if (child.nodeType === TEXT_NODE) {
      const text = child.textContent ?? ''
      if (!text.trim()) { flushPending(); continue }
      ctx.textBatchRaw.push(text)
      ctx.textBatchSlots.push({ out: pending, idx: pending.length })
      pending.push('')
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as ElementLike
      if (BLOCK_TAGS.has(el.localName) && el.localName !== 'li') {
        flushPending()
        convertElement(el, ctx, blocks)
      } else {
        convertInlineText(el, ctx, pending)
      }
    }
  }
  flushPending()
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
  const headerTexts: string[] = []
  const rowTexts: string[][] = []

  let directTrs: ElementLike[] = []
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    const child = ch[i]
    const t = child.localName
    if (t === 'thead') {
      const trs = child.children
      for (let j = 0; j < trs.length; j++) {
        if (trs[j].localName === 'tr') { readRow(trs[j], headerTexts, rowTexts, ctx); break }
      }
    } else if (t === 'tbody') {
      const trs = child.children
      for (let j = 0; j < trs.length; j++) {
        if (trs[j].localName === 'tr') readRow(trs[j], headerTexts, rowTexts, ctx)
      }
    } else if (t === 'tr') {
      directTrs.push(child)
    }
  }

  for (let i = 0; i < directTrs.length; i++) {
    readRow(directTrs[i], headerTexts, rowTexts, ctx)
  }

  if (!headerTexts.length && rowTexts.length) {
    const first = rowTexts.shift()!
    for (let i = 0; i < first.length; i++) headerTexts.push(first[i])
  }

  if (headerTexts.length || rowTexts.length) {
    out.push({ type: BlockType.table, headerTexts, rowTexts })
  }
}

function readRow(tr: ElementLike, headerTexts: string[], rowTexts: string[][], ctx: Context): void {
  const row: string[] = []
  let hadHeader = false
  const cells = tr.children
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    const text = collectInlineText(cell, ctx)
    if (cell.localName === 'th') hadHeader = true
    row.push(text)
  }
  if (!row.length) return
  if (hadHeader && !headerTexts.length) {
    for (let i = 0; i < row.length; i++) headerTexts.push(row[i])
  } else {
    rowTexts.push(row)
  }
}
