import type { HtmlToMdOptions, ElementLike, Block } from './options.ts'
import {
  SkipFlags,
  resolveOptions,
  makeCtx,
} from './options.ts'
import {
  collapseTrim,
  postProcess,
} from './utils.ts'
import {
  convertChildren,
} from './parser.ts'
import {
  serializeBlocks,
} from './serializer.ts'

export { HOIST_IMAGES, HOIST_LINKS, SkipFlags } from './options.ts'
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
