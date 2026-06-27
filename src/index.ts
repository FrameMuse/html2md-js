import type { HtmlToMdOptions } from './options.ts'
import {
  HOIST_IMAGES,
  HOIST_LINKS,
  SkipFlags,
  resolveOptions,
  makeCtx,
} from './options.ts'
import {
  ensureParser,
  collapseTrim,
  postProcess,
} from './utils.ts'
import {
  convertChildren,
} from './parser.ts'
import {
  serializeBlocks,
} from './serializer.ts'

export { HOIST_IMAGES, HOIST_LINKS, SkipFlags }
export type { HtmlToMdOptions }

export function htmlToMd(input: Element | string, options?: HtmlToMdOptions): string {
  const opts = resolveOptions(options)

  let element: Element
  if (typeof input === 'string') {
    const parser = ensureParser()
    const doc = parser(input)
    element = doc.body
  } else {
    element = input
  }

  const ctx = makeCtx(opts)
  const blocks = convertChildren(element, ctx)
  let result = serializeBlocks(blocks, opts, 0)
  result = collapseTrim(result)
  result = postProcess(result)

  // append hoisted definitions
  if ((opts.flags & (HOIST_IMAGES | HOIST_LINKS)) && opts.hoisted.size) {
    let footer = '\n\n'
    for (const [url, ref] of opts.hoisted) {
      footer += '[' + ref.ref + ']: ' + url
      if (ref.title) footer += ' "' + ref.title + '"'
      footer += '\n'
    }
    result += footer
  }

  return result
}
