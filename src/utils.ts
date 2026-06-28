import {
  type Block,
  type CodeByRule,
  type ElementLike,
  type Inline,
  type ListItem,
  type NodeLike,
  type TextLike,
  BlockType,
  InlineType,
  BLOCK_TAGS,
  ELEMENT_NODE,
  TEXT_NODE
} from './options'
import {
  RE_ESCAPE,
  RE_WS,
  RE_SPLIT_WS,
  RE_TRIM_NEWLINES,
  RE_COLLAPSE_NEWLINES,
  RE_EMPTY_ANCHOR,
  RE_UNESCAPE_HYPHEN,
} from './regexps'

const _ESCAPE_TABLE = new Uint8Array(128);
[92, 42, 95, 96, 91, 93, 123, 125, 40, 41, 35, 43, 45, 46, 33].forEach(code => {
  _ESCAPE_TABLE[code] = 1
})
const _ENCODER = new TextEncoder()
const _DECODER = new TextDecoder()
const _SRC_BUF = new Uint8Array(65536)
const _DST_BUF = new Uint8Array(65536 * 2)

export function escapeMarkdown(text: string): string {
  if (!RE_ESCAPE.test(text)) return text
  const encoded = _ENCODER.encodeInto(text, _SRC_BUF)
  const srcLen = encoded.written
  let destIdx = 0
  for (let i = 0; i < srcLen; i++) {
    const byte = _SRC_BUF[i]
    if (byte < 128 && _ESCAPE_TABLE[byte] === 1) {
      _DST_BUF[destIdx++] = 92
    }
    _DST_BUF[destIdx++] = byte
  }
  return _DECODER.decode(_DST_BUF.subarray(0, destIdx))
}

const _WS_TABLE = new Uint8Array(128);
[32, 10, 13, 9].forEach(code => { _WS_TABLE[code] = 1 })

export function collapseWhitespace(s: string): string {
  if (!RE_WS.test(s)) return s
  const encoded = _ENCODER.encodeInto(s, _SRC_BUF)
  const srcLen = encoded.written
  let destIdx = 0
  let prevSpace = false
  for (let i = 0; i < srcLen; i++) {
    const byte = _SRC_BUF[i]
    if (byte < 128 && _WS_TABLE[byte]) {
      if (!prevSpace) { _DST_BUF[destIdx++] = 32; prevSpace = true }
    } else {
      _DST_BUF[destIdx++] = byte
      prevSpace = false
    }
  }
  return _DECODER.decode(_DST_BUF.subarray(0, destIdx))
}

export function processText(text: string): string {
  if (!RE_WS.test(text) && !RE_ESCAPE.test(text)) return text
  const encoded = _ENCODER.encodeInto(text, _SRC_BUF)
  const srcLen = encoded.written
  let di = 0
  let prevSpace = false
  for (let i = 0; i < srcLen; i++) {
    const byte = _SRC_BUF[i]
    // collapse whitespace
    if (byte < 128 && _WS_TABLE[byte]) {
      if (!prevSpace) { _DST_BUF[di++] = 32; prevSpace = true }
      continue
    }
    prevSpace = false
    // escape markdown
    if (byte < 128 && _ESCAPE_TABLE[byte]) _DST_BUF[di++] = 92
    _DST_BUF[di++] = byte
  }
  return _DECODER.decode(_DST_BUF.subarray(0, di))
}

export const _BOUNDARY_BUF = new Uint32Array(10000)

export interface ProcessedTexts {
  decoded: string
  bOffset: number
}

export function processTexts(joined: string): ProcessedTexts {
  if (!RE_WS.test(joined) && !RE_ESCAPE.test(joined)) {
    let bi = 0
    for (let i = 0; i < joined.length; i++) {
      if (joined[i] === '\x00') _BOUNDARY_BUF[bi++] = i
    }
    _BOUNDARY_BUF[bi++] = joined.length
    return { decoded: joined, bOffset: bi }
  }

  const srcLen = _ENCODER.encodeInto(joined, _SRC_BUF).written
  let di = 0
  let prevSpace = false
  let bOffset = 0
  for (let i = 0; i < srcLen; i++) {
    const byte = _SRC_BUF[i]
    if (byte === 0) {
      _BOUNDARY_BUF[bOffset++] = di
      prevSpace = false
      continue
    }
    if (byte < 128) {
      if (_WS_TABLE[byte]) {
        if (!prevSpace) { _DST_BUF[di++] = 32; prevSpace = true }
        continue
      }
      if (_ESCAPE_TABLE[byte]) _DST_BUF[di++] = 92
      _DST_BUF[di++] = byte
    }
    prevSpace = false
  }
  _BOUNDARY_BUF[bOffset++] = di

  return { decoded: _DECODER.decode(_DST_BUF.subarray(0, di)), bOffset }
}

export function matchesCodeBy(elem: ElementLike, rules: CodeByRule[]): boolean {
  const tag = elem.localName
  const rawCls = elem.getAttribute?.('class')
  const classes = rawCls ? rawCls.split(RE_SPLIT_WS) : null
  return rules.some(r => {
    if (r.tag && tag !== r.tag) return false
    if (r.class && (!classes || !classes.includes(r.class))) return false
    return true
  })
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
  const tokens = cls.split(RE_SPLIT_WS)
  for (let i = 0; i < tokens.length; i++) {
    const mapped = ADMONITION_MAP[tokens[i]]
    if (mapped) return mapped
  }
  return null
}

export function hasBlockChildren(elem: ElementLike): boolean {
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    if (BLOCK_TAGS.has(ch[i].localName)) return true
  }
  return false
}

export function getTextContent(node: NodeLike): string {
  if (node.nodeType === TEXT_NODE) return node.textContent ?? ''
  let out = ''
  const cn = node.childNodes
  for (let i = 0; i < cn.length; i++) {
    const child = cn[i]
    if (child.nodeType === TEXT_NODE) out += child.textContent ?? ''
    else if (child.nodeType === ELEMENT_NODE) {
      const el = child as ElementLike
      if (el.localName === 'br') out += '\n'
      else out += getTextContent(el)
    }
  }
  return out
}

export function hasLinkChildren(elem: ElementLike): boolean {
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    if (ch[i].localName === 'a') return true
    if (hasLinkChildren(ch[i])) return true
  }
  return false
}

export function isInlineBlank(i: Inline): boolean {
  switch (i.type) {
    case InlineType.text: return !i.text || !i.text.trim()
    case InlineType.strong: case InlineType.emphasis: case InlineType.highlight: {
      if (!i.children) return true
      for (let j = 0; j < i.children.length; j++) {
        if (!isInlineBlank(i.children[j])) return false
      }
      return true
    }
    case InlineType.code: return !i.text
    case InlineType.link: {
      if (!i.children) return true
      for (let j = 0; j < i.children.length; j++) {
        if (!isInlineBlank(i.children[j])) return false
      }
      return true
    }
    case InlineType.image: return false
    case InlineType.linebreak: return false
  }
}

export function inlinesBlank(inlines: Inline[]): boolean {
  for (let i = 0; i < inlines.length; i++) {
    if (!isInlineBlank(inlines[i])) return false
  }
  return true
}

export function isBlockBlank(block: Block): boolean {
  switch (block.type) {
    case BlockType.document: {
      if (!block.children) return true
      for (let i = 0; i < block.children.length; i++) {
        if (!isBlockBlank(block.children[i])) return false
      }
      return true
    }
    case BlockType.paragraph: {
      if (block.text !== undefined) return !block.text.trim()
      if (!block.content) return true
      return inlinesBlank(block.content)
    }
    case BlockType.heading: {
      if (!block.content) return true
      return inlinesBlank(block.content)
    }
    case BlockType.blockquote: {
      if (!block.children) return true
      for (let i = 0; i < block.children.length; i++) {
        if (!isBlockBlank(block.children[i])) return false
      }
      return true
    }
    case BlockType.list: {
      if (!block.items) return true
      for (let i = 0; i < block.items.length; i++) {
        const item = block.items[i]
        if (!item.blocks || !item.blocks.length) continue
        for (let j = 0; j < item.blocks.length; j++) {
          if (!isBlockBlank(item.blocks[j])) return false
        }
      }
      return true
    }
    case BlockType.codeblock: return !block.code?.trim()
    case BlockType.table:
      if (block.headers) {
        for (let i = 0; i < block.headers.length; i++) {
          if (!inlinesBlank(block.headers[i])) return false
        }
      }
      if (block.rows) {
        for (let i = 0; i < block.rows.length; i++) {
          const row = block.rows[i]
          for (let j = 0; j < row.length; j++) {
            if (!inlinesBlank(row[j])) return false
          }
        }
      }
      return true
    case BlockType.hr: return false
  }
}

export function findChild(elem: ElementLike, tag: string): ElementLike | null {
  const ch = elem.children
  for (let i = 0; i < ch.length; i++) {
    if (ch[i].localName === tag) return ch[i]
  }
  return null
}

export function getCodeText(elem: ElementLike): string {
  let out = ''
  const cn = elem.childNodes
  for (let i = 0; i < cn.length; i++) {
    const child = cn[i]
    if (child.nodeType === TEXT_NODE && child.textContent) {
      out += child.textContent
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as ElementLike
      if (el.localName === 'br') out += '\n'
      else out += getCodeText(el)
    }
  }
  return out
}

export function extractLanguage(elem: ElementLike): string | undefined {
  const cls = elem.getAttribute?.('class')
  const lang = cls?.split(RE_SPLIT_WS).find(s => s.startsWith('language-'))
  return lang?.slice(9)
}

export function flushPendingInline(blocks: Block[], pending: Inline[] | null) {
  if (pending && pending.length > 0) {
    blocks.push(blockParagraph(pending))
  }
}

export function collapseTrim(s: string): string {
  return s
    .replace(RE_TRIM_NEWLINES, '')
    .replace(RE_COLLAPSE_NEWLINES, '\n\n')
}

export function postProcess(md: string): string {
  return md
    .replace(RE_EMPTY_ANCHOR, '')
    .replace(RE_UNESCAPE_HYPHEN, '-')
}

export function blockParagraph(content: Inline[]): Block {
  return { type: BlockType.paragraph, content }
}

export function blockBlockQuote(children: Block[]): Block {
  return { type: BlockType.blockquote, children }
}

export function blockList(ordered: boolean, items: ListItem[], start?: number): Block {
  return { type: BlockType.list, ordered, items, start: start ?? 1 }
}

export function blockCodeBlock(language: string | undefined, code: string, fenced: boolean): Block {
  return { type: BlockType.codeblock, language, code, fenced }
}
