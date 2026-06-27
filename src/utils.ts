import {
  type Block,
  type CodeByRule,
  type ElementLike,
  type Inline,
  type ListItem,
  type NodeLike,
  type TextLike,
  BLOCK_TAGS,
  CONTAINER_TAGS,
  ELEMENT_NODE,
  SKIP_TAGS,
  TEXT_NODE
} from './options'

const ESCAPE_CHARS = new Set(['\\', '*', '_', '[', ']', '#', '+', '-', '!', '`'])

export function escapeMarkdown(text: string): string {
  let out = ''
  for (const c of text) {
    if (ESCAPE_CHARS.has(c)) out += '\\'
    out += c
  }
  return out
}

const FAST_REGEX = /([\\*_`\[\]{}()#+\-\.!])/g

export function escapeMarkdownWithReplace(text: string): string {
  return text.replace(/([\\*_`\[\]{}()#+\-\.!])/g, '\\$1')
}

export function escapeMarkdownFastRegex(text: string): string {
  return text.replace(FAST_REGEX, '\\$1')
}

const ESCAPE_RE = /[\\*_`\[\]{}()#+\-\.!]/g

export function escapeMarkdownWithMatchAll(text: string): string {
  let out = ''
  let last = 0
  for (const match of text.matchAll(ESCAPE_RE)) {
    out += text.substring(last, match.index)
    out += '\\'
    out += match[0]
    last = match.index + 1
  }
  out += text.substring(last)
  return out
}

export function escapeMarkdownWithExec(text: string): string {
  let out = ''
  let last = 0
  let match: RegExpExecArray | null
  ESCAPE_RE.lastIndex = 0
  while ((match = ESCAPE_RE.exec(text)) !== null) {
    out += text.substring(last, match.index)
    out += '\\'
    out += match[0]
    last = match.index + 1
  }
  out += text.substring(last)
  return out
}

const ESCAPE_TABLE = new Uint8Array(128);
[92, 42, 95, 96, 91, 93, 123, 125, 40, 41, 35, 43, 45, 46, 33].forEach(code => {
  ESCAPE_TABLE[code] = 1
})

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const SRC_BUFFER = new Uint8Array(65536)
const DEST_BUFFER = new Uint8Array(65536 * 2)

export function escapeMarkdownGodMode(text: string): string {
  const { written: srcLen } = encoder.encodeInto(text, SRC_BUFFER)
  let destIdx = 0
  for (let i = 0; i < srcLen; i++) {
    const byte = SRC_BUFFER[i]
    if (byte < 128 && ESCAPE_TABLE[byte] === 1) {
      DEST_BUFFER[destIdx++] = 92
    }
    DEST_BUFFER[destIdx++] = byte
  }
  return decoder.decode(DEST_BUFFER.subarray(0, destIdx))
}

new TextEncoder

export function escapeMarkdownSuperFast(text: string): string {
  const len = text.length
  let out = ''
  let lastIndex = 0

  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i)
    if (code < 128 && ESCAPE_TABLE[code] === 1) {
      if (i > lastIndex) {
        out += text.substring(lastIndex, i) + '\\' + text[i]
      } else {
        out += '\\' + text[i]
      }
      
      lastIndex = i + 1
    }
  }

  if (lastIndex < len) {
    out += text.substring(lastIndex)
  }

  return out || text
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

export function matchesCodeBy(elem: ElementLike, rules: CodeByRule[]): boolean {
  const tag = elem.localName
  const rawCls = elem.getAttribute?.('class')
  const classes = rawCls ? rawCls.split(/\s+/) : null
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
  for (const token of cls.split(/\s+/)) {
    const mapped = ADMONITION_MAP[token]
    if (mapped) return mapped
  }
  return null
}

export function hasBlockChildren(elem: ElementLike): boolean {
  for (const child of elem.children) {
    if (isBlockTag(child.localName)) return true
  }
  return false
}

export function getTextContent(node: NodeLike): string {
  if (node.nodeType === TEXT_NODE) return (node as TextLike).textContent ?? ''
  let out = ''
  for (const child of (node as ElementLike).childNodes) {
    if (child.nodeType === TEXT_NODE) out += (child as TextLike).textContent ?? ''
    else if (child.nodeType === ELEMENT_NODE) {
      const el = child as ElementLike
      if (el.localName === 'br') out += '\n'
      else out += getTextContent(el)
    }
  }
  return out
}

export function hasLinkChildren(elem: ElementLike): boolean {
  for (const child of elem.children) {
    if (child.localName === 'a') return true
    if (hasLinkChildren(child)) return true
  }
  return false
}

export function isInlineBlank(i: Inline): boolean {
  switch (i.type) {
    case 'text': return !i.text || !i.text.trim()
    case 'strong': case 'emphasis': case 'highlight': {
      if (!i.children) return true
      for (let j = 0; j < i.children.length; j++) {
        if (!isInlineBlank(i.children[j])) return false
      }
      return true
    }
    case 'code': return !i.text
    case 'link': {
      if (!i.children) return true
      for (let j = 0; j < i.children.length; j++) {
        if (!isInlineBlank(i.children[j])) return false
      }
      return true
    }
    case 'image': return false
    case 'linebreak': return false
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
    case 'document': {
      if (!block.children) return true
      for (let i = 0; i < block.children.length; i++) {
        if (!isBlockBlank(block.children[i])) return false
      }
      return true
    }
    case 'paragraph': {
      if (!block.content) return true
      return inlinesBlank(block.content)
    }
    case 'heading': {
      if (!block.content) return true
      return inlinesBlank(block.content)
    }
    case 'blockquote': {
      if (!block.children) return true
      for (let i = 0; i < block.children.length; i++) {
        if (!isBlockBlank(block.children[i])) return false
      }
      return true
    }
    case 'list': {
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
    case 'codeblock': return !block.code?.trim()
    case 'table':
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
    case 'hr': return false
  }
}

export function findChild(elem: ElementLike, tag: string): ElementLike | null {
  for (const child of elem.children) {
    if (child.localName === tag) return child
  }
  return null
}

export function getCodeText(elem: ElementLike): string {
  let out = ''
  for (const child of elem.childNodes) {
    if (child.nodeType === TEXT_NODE) {
      out += (child as TextLike).textContent ?? ''
    } else if (child.nodeType === ELEMENT_NODE) {
      const el = child as ElementLike
      if (el.localName === 'br') out += '\n'
      else out += getCodeText(el)
    }
  }
  return out
}

export function extractLanguage(elem: ElementLike): string | undefined {
  const cls = elem.getAttribute?.('class') ?? ''
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
