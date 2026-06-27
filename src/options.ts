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

export const SKIP_TAG_FLAGS: Record<string, number> = {
  header: SkipFlags.HEADER,
  footer: SkipFlags.FOOTER,
  aside: SkipFlags.ASIDE,
  nav: SkipFlags.NAV,
  menu: SkipFlags.MENU,
}

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

export interface CodeByRule {
  tag: string | null
  class: string | null
}

export interface ImageRef {
  ref: string
  title?: string
}

export class HoistedMap extends Map<string, ImageRef> {
  #footer = ''

  get footer(): string {
    return this.#footer
  }

  addImage(url: string, title?: string): ImageRef {
    let ref = this.get(url)
    if (!ref) {
      ref = { ref: 'img' + this.size, title }
      super.set(url, ref)
      this.#footer += `[${ref.ref}]: ${url}`
      if (title) this.#footer += ` "${title}"`
      this.#footer += '\n'
    }
    return ref
  }

  addLink(url: string, content: string, title?: string): ImageRef {
    let ref = this.get(url)
    if (!ref) {
      const includeTitle = title && title !== content ? title : undefined
      ref = { ref: 'ref' + this.size, title: includeTitle }
      super.set(url, ref)
      this.#footer += `[${ref.ref}]: ${url}`
      if (includeTitle) this.#footer += ` "${includeTitle}"`
      this.#footer += '\n'
    }
    return ref
  }
}

export interface ResolvedOptions {
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
  hoisted: HoistedMap
}

export enum InlineType {
  text = 'text',
  strong = 'strong',
  emphasis = 'emphasis',
  highlight = 'highlight',
  code = 'code',
  link = 'link',
  image = 'image',
  linebreak = 'linebreak',
}

export enum BlockType {
  document = 'document',
  heading = 'heading',
  paragraph = 'paragraph',
  blockquote = 'blockquote',
  list = 'list',
  codeblock = 'codeblock',
  hr = 'hr',
  table = 'table',
}

export interface Block {
  type: BlockType
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

export interface ListItem {
  blocks: Block[]
}

export interface Inline {
  type: InlineType
  text?: string
  children?: Inline[]
  url?: string
  title?: string
  alt?: string
}

export interface Context {
  options: ResolvedOptions
  inList: boolean
}

export const ELEMENT_NODE = 1
export const TEXT_NODE = 3

export interface TextLike {
  readonly nodeType: number
  readonly textContent: string | null
  readonly childNodes: readonly NodeLike[]
}

export interface ElementLike {
  readonly nodeType: number
  readonly textContent: string | null
  readonly childNodes: readonly NodeLike[]
  readonly localName: string
  readonly children: readonly ElementLike[]
  getAttribute?(name: string): string | null
  setAttribute?(name: string, value: string): void
}

export type NodeLike = TextLike | ElementLike

export const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'table',
  'ul', 'ol', 'li',
  'div', 'section', 'article', 'main',
  'aside', 'header', 'footer', 'nav',
  'figure', 'figcaption', 'address',
  'form', 'fieldset', 'hr',
])

export const SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'template',
  'form', 'fieldset',
  'button', 'input', 'select', 'textarea', 'option',
  'head',
])

export const CONTAINER_TAGS = new Set([
  'div', 'section', 'article', 'main',
  'aside', 'header', 'footer', 'nav', 'figure',
])

export function resolveOptions(opts?: HtmlToMdOptions): ResolvedOptions {
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
    hoisted: new HoistedMap(),
  }
}

export function parseCodeByRule(s: string): CodeByRule {
  const dot = s.indexOf('.')
  if (dot === -1) {
    if (s.startsWith('.')) return { tag: null, class: s.slice(1) }
    return { tag: s, class: null }
  }
  const tag = dot === 0 ? null : s.slice(0, dot)
  const cls = s.slice(dot + 1)
  return { tag: tag || null, class: cls || null }
}

export function makeCtx(opts: ResolvedOptions): Context {
  return { options: opts, inList: false }
}
