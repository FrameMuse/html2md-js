import type { Block, ElementLike, HtmlToMdOptions, CodeByRule } from './options'
import {
  HoistedMap,
  parseCodeByRule,
} from './options'
import {
  convertChildren,
} from './parser'
import {
  serializeBlocks,
} from './serializer'
import {
  collapseTrim,
  postProcess,
} from './utils'

export { HOIST_IMAGES, HOIST_LINKS, SkipFlags } from './options'
export type { HtmlToMdOptions }

export class HtmlToMd {
  private headingStyle: 'atx' | 'setext'
  private codeBlockStyle: 'fenced' | 'indented'
  private bulletListMarker: string
  private hr: string
  private emDelimiter: string
  private strongDelimiter: string
  private fence: string
  private codeBy: CodeByRule[]
  private flags: number
  private skip: number

  constructor(options?: HtmlToMdOptions) {
    this.headingStyle = options?.headingStyle ?? 'atx'
    this.codeBlockStyle = options?.codeBlockStyle ?? 'fenced'
    this.bulletListMarker = options?.bulletListMarker ?? '-'
    this.hr = options?.hr ?? '---'
    this.emDelimiter = options?.emDelimiter ?? '_'
    this.strongDelimiter = options?.strongDelimiter ?? '**'
    this.fence = options?.fence ?? '```'
    this.codeBy = (options?.codeBy ?? []).map(parseCodeByRule)
    this.flags = options?.flags ?? 0
    this.skip = options?.skip ?? 0
  }

  convert(input: ElementLike): string {
    const hoisted = new HoistedMap()
    const opts = {
      headingStyle: this.headingStyle,
      codeBlockStyle: this.codeBlockStyle,
      bulletListMarker: this.bulletListMarker,
      hr: this.hr,
      emDelimiter: this.emDelimiter,
      strongDelimiter: this.strongDelimiter,
      fence: this.fence,
      codeBy: this.codeBy,
      flags: this.flags,
      skip: this.skip,
      hoisted,
    }
    const ctx = { options: opts, inList: false }
    const blocks: Block[] = []
    convertChildren(input, ctx, blocks)
    let result = serializeBlocks(blocks, opts, 0)
    result = collapseTrim(result)
    result = postProcess(result)
    if (hoisted.size) result += '\n\n' + hoisted.footer
    return result
  }
}

export function htmlToMd(input: ElementLike, options?: HtmlToMdOptions): string {
  return new HtmlToMd(options).convert(input)
}
