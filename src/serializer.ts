import type { Block, Inline, ResolvedOptions } from './options'
import {
  BlockType,
  InlineType,
  HOIST_IMAGES,
  HOIST_LINKS,
} from './options'
import {
  isBlockBlank
} from './utils'

function serializeBlock(block: Block, opts: ResolvedOptions, depth: number): string {
  switch (block.type) {
    case BlockType.document:
      return serializeBlocks(block.children ?? [], opts, depth)

    case BlockType.heading:
      return serializeHeading(block.level!, block.content!, opts)

    case BlockType.paragraph:
      return serializeParagraph(block.content ?? [], opts)

    case BlockType.blockquote:
      return serializeBlockQuote(block.children ?? [], opts, depth)

    case BlockType.list:
      return serializeList(block.ordered!, block.start ?? 1, block.items ?? [], opts, depth)

    case BlockType.codeblock:
      return serializeCodeBlock(block.language, block.code ?? '', block.fenced ?? true, opts)

    case BlockType.hr:
      return opts.hr + '\n\n'

    case BlockType.table:
      return serializeTable(block.headers ?? [], block.rows ?? [], opts)

    default:
      return ''
  }
}

function serializeBlocks(blocks: Block[], opts: ResolvedOptions, depth: number): string {
  let out = ''
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (isBlockBlank(b)) continue
    out += serializeBlock(b, opts, depth)
  }
  return out
}

function serializeHeading(level: number, content: Inline[], opts: ResolvedOptions): string {
  let text = serializeInlines(content, opts)
  if (!text.trim()) return ''
  if (opts.headingStyle === 'setext' && level <= 2) {
    let underline = level === 1 ? '=' : '-'
    return text + '\n' + underline.repeat(text.length) + '\n\n'
  }
  return '#'.repeat(level) + ' ' + text + '\n\n'
}

function serializeParagraph(content: Inline[], opts: ResolvedOptions): string {
  let text = serializeInlines(content, opts)
  if (!text.trim()) return ''
  return text + '\n\n'
}

function serializeBlockQuote(blocks: Block[], opts: ResolvedOptions, depth: number): string {
  let content = serializeBlocks(blocks, opts, depth)
  content = content.trimEnd()
  if (!content) return ''
  let lines = content.split('\n')
  let out = lines.map((line, i) => {
    if (i > 0 && line.startsWith('>')) return line
    return '> ' + (line.startsWith('>') ? '' : line)
  }).join('\n')
  return out + '\n\n'
}

function serializeList(ordered: boolean, start: number, items: ListItem[], opts: ResolvedOptions, depth: number): string {
  let indent = '  '.repeat(depth)
  let out = ''
  for (let i = 0; i < items.length; i++) {
    out += indent
    if (ordered) {
      let num = start + i
      out += num + '.  '
    } else {
      out += opts.bulletListMarker + ' '
    }
    let prefixLen = ordered ? (start + i).toString().length + 3 : 2
    out += serializeListItem(items[i], opts, depth + 1, prefixLen, indent)
  }
  out += '\n'
  return out
}

function serializeListItem(item: ListItem, opts: ResolvedOptions, _depth: number, _prefixLen: number, _indent: string): string {
  let content = ''
  for (let i = 0; i < item.blocks.length; i++) {
    const b = item.blocks[i]
    const next = i < item.blocks.length - 1 ? item.blocks[i + 1] : null
    if (b.type === BlockType.paragraph) {
      content += serializeInlines(b.content ?? [], opts)
      if (next && next.type === BlockType.list) content += '\n'
      else if (next) content += '\n\n'
    } else if (b.type === BlockType.list) {
      content += serializeBlock(b, opts, _depth)
    } else {
      content += serializeBlock(b, opts, _depth)
    }
  }
  return content + '\n'
}

function serializeCodeBlock(language: string | undefined, code: string, fenced: boolean, opts: ResolvedOptions): string {
  let useFenced = fenced || opts.codeBlockStyle === 'fenced'
  if (useFenced) {
    return opts.fence + (language ?? '') + '\n' + code + '\n' + opts.fence + '\n\n'
  }
  return code.split('\n').map(l => '    ' + l).join('\n') + '\n\n'
}

function serializeTable(headers: Inline[][], rows: Inline[][][], opts: ResolvedOptions): string {
  if (!headers.length && !rows.length) return ''

  let colCount = headers.length
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].length > colCount) colCount = rows[r].length
  }

  const cell = (text: string) => {
    if (text) return ' ' + text
    return ''
  }

  let out = '|'
  for (let i = 0; i < colCount; i++) {
    let text = i < headers.length ? serializeInlines(headers[i], opts) : ''
    out += cell(text) + ' |'
  }
  out += '\n|'
  for (let i = 0; i < colCount; i++) {
    out += ' --- |'
  }
  out += '\n'

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    out += '|'
    for (let i = 0; i < colCount; i++) {
      let content = i < row.length ? row[i] : []
      let text = serializeInlines(content, opts)
      out += cell(text) + ' |'
    }
    out += '\n'
  }
  out += '\n'
  return out
}

// ---- inline serialization ----

function serializeInlines(inlines: Inline[], opts: ResolvedOptions): string {
  let out = ''
  for (let i = 0; i < inlines.length; i++) {
    out += serializeInline(inlines[i], opts)
  }
  return out
}

function serializeInline(inline: Inline, opts: ResolvedOptions): string {
  switch (inline.type) {
    case InlineType.text:
      return inline.text ?? ''

    case InlineType.strong: {
      let inner = serializeInlines(inline.children ?? [], opts)
      if (!inner.trim()) return ''
      return opts.strongDelimiter + inner + opts.strongDelimiter
    }

    case InlineType.emphasis: {
      let inner = serializeInlines(inline.children ?? [], opts)
      if (!inner.trim()) return ''
      return opts.emDelimiter + inner + opts.emDelimiter
    }

    case InlineType.highlight: {
      let inner = serializeInlines(inline.children ?? [], opts)
      if (!inner.trim()) return ''
      return '==' + inner + '=='
    }

    case InlineType.code: {
      let text = inline.text ?? ''
      if (!text) return ''
      let bt = text.includes('`') ? '``' : '`'
      let space = (text.startsWith('`') || text.endsWith('`')) ? ' ' : ''
      return bt + space + text + space + bt
    }

    case InlineType.link: {
      let content = serializeInlines(inline.children ?? [], opts)
      let url = inline.url ?? ''
      if (opts.flags & HOIST_LINKS && url) {
        return '[' + content + '][' + opts.hoisted.addLink(url, content, inline.title).ref + ']'
      }
      let out = '[' + content + '](' + url
      if (inline.title && inline.title !== content) out += ' "' + inline.title + '"'
      out += ')'
      return out
    }

    case InlineType.image: {
      let alt = inline.alt ?? ''
      let url = inline.url ?? ''
      let title = inline.title
      if (opts.flags & HOIST_IMAGES) {
        return '![' + alt + '][' + opts.hoisted.addImage(url, title).ref + ']'
      }
      let out = '![' + alt + '](' + url
      if (title) out += ' "' + title + '"'
      out += ')'
      return out
    }

    case InlineType.linebreak:
      return '  \n'

    default:
      return ''
  }
}

export { serializeBlock, serializeBlocks, serializeInlines }
