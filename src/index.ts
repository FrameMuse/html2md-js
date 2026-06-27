import type { Block, ElementLike, HtmlToMdOptions } from './options'
import {
  makeCtx,
  resolveOptions
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

export function htmlToMd(input: ElementLike, options?: HtmlToMdOptions): string {
  const opts = resolveOptions(options)
  const ctx = makeCtx(opts)
  const blocks: Block[] = []
  convertChildren(input, ctx, blocks)
  let result = serializeBlocks(blocks, opts, 0)
  result = collapseTrim(result)
  result = postProcess(result)

  if (opts.hoisted.size) result += '\n\n' + opts.hoisted.footer

  return result
}
