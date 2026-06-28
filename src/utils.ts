import {
  type Block,
  type CodeByRule,
  type ElementLike,
  type NodeLike,
  BlockType,
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

const _WS_TABLE = new Uint8Array(128);
[32, 10, 13, 9].forEach(code => { _WS_TABLE[code] = 1 })

export function processText(text: string): string {
  if (!RE_WS.test(text) && !RE_ESCAPE.test(text)) return text
  const encoded = _ENCODER.encodeInto(text, _SRC_BUF)
  const srcLen = encoded.written
  let di = 0
  let prevSpace = false
  for (let i = 0; i < srcLen; i++) {
    const byte = _SRC_BUF[i]
    if (byte < 128 && _WS_TABLE[byte]) {
      if (!prevSpace) { _DST_BUF[di++] = 32; prevSpace = true }
      continue
    }
    prevSpace = false
    if (byte < 128 && _ESCAPE_TABLE[byte]) _DST_BUF[di++] = 92
    _DST_BUF[di++] = byte
  }
  return _DECODER.decode(_DST_BUF.subarray(0, di))
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

export function blockParagraph(text: string): Block {
  return { type: BlockType.paragraph, text }
}
