import type { Block, ElementLike, HtmlToMdOptions, ResolvedOptions, Context } from './options'
import {
  HoistedMap,
  parseCodeByRule,
} from './options'
import {
  convertChildren,
  flushTextBatchSlots,
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
  private opts: ResolvedOptions
  private ctx: Context

  constructor(options?: HtmlToMdOptions) {
    this.opts = {
      headingStyle: options?.headingStyle ?? 'atx',
      codeBlockStyle: options?.codeBlockStyle ?? 'fenced',
      bulletListMarker: options?.bulletListMarker ?? '-',
      hr: options?.hr ?? '---',
      emDelimiter: options?.emDelimiter ?? '_',
      strongDelimiter: options?.strongDelimiter ?? '**',
      fence: options?.fence ?? '```',
      codeBy: (options?.codeBy ?? []).map(parseCodeByRule),
      flags: options?.flags ?? 0,
      skip: options?.skip ?? 0,
      hoisted: new HoistedMap(),
    }
    this.ctx = { options: this.opts, inList: false, textBatchSlots: [] }
  }

  convert(input: ElementLike): string {
    this.opts.hoisted = new HoistedMap()
    this.ctx.inList = false
    this.ctx.textBatchSlots = []
    const blocks: Block[] = []
    convertChildren(input, this.ctx, blocks)
    flushTextBatchSlots(this.ctx)
    let result = serializeBlocks(blocks, this.opts, 0)
    result = collapseTrim(result)
    result = postProcess(result)
    if (this.opts.hoisted.size) result += '\n\n' + this.opts.hoisted.footer
    return result
  }
}
