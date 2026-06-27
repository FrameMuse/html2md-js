import type { Context, Block, Inline, ListItem, ResolvedOptions } from './options.ts'
import {
  ELEMENT_NODE,
  TEXT_NODE,
  SkipFlags,
  BLOCK_TAGS,
  SKIP_TAGS,
  CONTAINER_TAGS,
  makeCtx,
  resolveOptions,
} from './options.ts'
import {
  escapeMarkdown,
  collapseWhitespace,
  isBlockTag,
  isSkipTag,
  isContainerTag,
  matchesCodeBy,
  ensureParser,
  admonitionType,
  blockParagraph,
  blockBlockQuote,
  blockList,
  blockCodeBlock,
  hasBlockChildren,
  getTextContent,
  hasLinkChildren,
  isInlineBlank,
  inlinesBlank,
  findChild,
  getCodeText,
  extractLanguage,
  flushPendingInline,
} from './utils.ts'

// ---- admonition detection ----

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

// ---- inline conversion ----

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

// ---- block conversion ----

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

export { convertNode, convertChildren, convertElement, convertInline, collectInlines, convertTable }
export { convertAdmonition, propagateLanguage, convertCodeByElement }
