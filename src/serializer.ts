import type { Block, ListItem, ResolvedOptions } from './options'
import { BlockType } from './options'

const HEADING_PREFIX = [
  '',         // 0 unused
  '# ',       // h1
  '## ',      // h2
  '### ',     // h3
  '#### ',    // h4
  '##### ',   // h5
  '###### ',  // h6
]

const INDENT_CACHE: string[] = ['']
function indentStr(depth: number): string {
  while (depth >= INDENT_CACHE.length) {
    INDENT_CACHE.push(INDENT_CACHE[INDENT_CACHE.length - 1] + '  ')
  }
  return INDENT_CACHE[depth]
}

function _serializeBlock(block: Block, opts: ResolvedOptions, depth: number, out: string[]): void {
  switch (block.type) {
    case BlockType.document:
      _serializeBlocks(block.children ?? [], opts, depth, out)
      break

    case BlockType.heading:
      if (block.text) {
        if (opts.headingStyle === 'setext' && block.level! <= 2) {
          out.push(block.text, '\n', (block.level === 1 ? '=' : '-').repeat(block.text.length), '\n\n')
        } else {
          out.push(HEADING_PREFIX[block.level!], block.text, '\n\n')
        }
      }
      break

    case BlockType.paragraph:
      if (block.text) out.push(block.text, '\n\n')
      break

    case BlockType.blockquote:
      _serializeBlockQuote(block.children ?? [], opts, depth, out)
      break

    case BlockType.list:
      _serializeList(block.ordered!, block.start ?? 1, block.items ?? [], opts, depth, out)
      break

    case BlockType.codeblock:
      _serializeCodeBlock(block.language, block.code ?? '', block.fenced ?? true, opts, out)
      break

    case BlockType.hr:
      out.push(opts.hr, '\n\n')
      break

    case BlockType.table:
      _serializeTable(block.headerTexts ?? [], block.rowTexts ?? [], out)
      break
  }
}

export function _serializeBlocks(blocks: Block[], opts: ResolvedOptions, depth: number, out: string[]): void {
  for (let i = 0; i < blocks.length; i++) {
    _serializeBlock(blocks[i], opts, depth, out)
  }
}

function _serializeBlockQuote(blocks: Block[], opts: ResolvedOptions, depth: number, out: string[]): void {
  const innerOut: string[] = []
  _serializeBlocks(blocks, opts, depth, innerOut)
  const content = innerOut.join('').trimEnd()
  if (!content) return

  let start = 0
  for (let i = 0; i <= content.length; i++) {
    if (i === content.length || content[i] === '\n') {
      const line = content.slice(start, i)
      out.push('> ')
      if (!line.startsWith('>')) out.push(line)
      else out.push(line.slice(1))
      if (i < content.length) out.push('\n')
      start = i + 1
    }
  }
  out.push('\n\n')
}

function _serializeList(ordered: boolean, start: number, items: ListItem[], opts: ResolvedOptions, depth: number, out: string[]): void {
  const ind = indentStr(depth)
  for (let i = 0; i < items.length; i++) {
    out.push(ind)
    if (ordered) {
      out.push(String(start + i), '.  ')
    } else {
      out.push(opts.bulletListMarker, ' ')
    }
    _serializeListItem(items[i], opts, depth + 1, out)
  }
  out.push('\n')
}

function _serializeListItem(item: ListItem, opts: ResolvedOptions, depth: number, out: string[]): void {
  for (let i = 0; i < item.blocks.length; i++) {
    const b = item.blocks[i]
    const next = i < item.blocks.length - 1 ? item.blocks[i + 1] : null
    if (b.type === BlockType.paragraph) {
      out.push(b.text ?? '')
      if (next && next.type === BlockType.list) out.push('\n')
      else if (next) out.push('\n\n')
    } else if (b.type === BlockType.list) {
      _serializeBlock(b, opts, depth, out)
    } else {
      _serializeBlock(b, opts, depth, out)
    }
  }
  out.push('\n')
}

function _serializeCodeBlock(language: string | undefined, code: string, fenced: boolean, opts: ResolvedOptions, out: string[]): void {
  const useFenced = fenced || opts.codeBlockStyle === 'fenced'
  if (useFenced) {
    out.push(opts.fence, language ?? '', '\n', code, '\n', opts.fence, '\n\n')
  } else {
    for (let i = 0; i < code.length; i++) {
      if (i === 0 || code[i - 1] === '\n') out.push('    ')
      out.push(code[i])
    }
    out.push('\n\n')
  }
}

function _serializeTable(headerTexts: string[], rowTexts: string[][], out: string[]): void {
  if (!headerTexts.length && !rowTexts.length) return

  let colCount = headerTexts.length
  for (let r = 0; r < rowTexts.length; r++) {
    if (rowTexts[r].length > colCount) colCount = rowTexts[r].length
  }

  out.push('|')
  for (let i = 0; i < colCount; i++) {
    if (i < headerTexts.length && headerTexts[i]) out.push(' ', headerTexts[i])
    out.push(' |')
  }
  out.push('\n|')
  for (let i = 0; i < colCount; i++) out.push(' --- |')
  out.push('\n')

  for (let r = 0; r < rowTexts.length; r++) {
    const row = rowTexts[r]
    out.push('|')
    for (let i = 0; i < colCount; i++) {
      if (i < row.length && row[i]) out.push(' ', row[i])
      out.push(' |')
    }
    out.push('\n')
  }
  out.push('\n')
}

// ---- public API wrappers ----

function serializeBlocks(blocks: Block[], opts: ResolvedOptions, depth: number): string {
  const out: string[] = []
  _serializeBlocks(blocks, opts, depth, out)
  return out.join('')
}

function serializeBlock(block: Block, opts: ResolvedOptions, depth: number): string {
  const out: string[] = []
  _serializeBlock(block, opts, depth, out)
  return out.join('')
}

export { serializeBlock, serializeBlocks }
