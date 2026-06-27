import { bench } from "benchik"

// ---- production reference ----
import { escapeMarkdown } from "../src/utils.ts"

// ---- variant definitions ----
const _ESCAPE_CHARS = new Set(['\\', '*', '_', '[', ']', '#', '+', '-', '!', '`'])

function loopSet(text: string): string {
  let out = ''
  for (const c of text) {
    if (_ESCAPE_CHARS.has(c)) out += '\\'
    out += c
  }
  return out
}

const _ESCAPE_RE = /[\\*_`\[\]{}()#+\-\.!]/g

function execWhile(text: string): string {
  let out = ''
  let last = 0
  let match: RegExpExecArray | null
  _ESCAPE_RE.lastIndex = 0
  while ((match = _ESCAPE_RE.exec(text)) !== null) {
    out += text.substring(last, match.index)
    out += '\\'
    out += match[0]
    last = match.index + 1
  }
  out += text.substring(last)
  return out
}

const _ESCAPE_TABLE = new Uint8Array(128);
[92, 42, 95, 96, 91, 93, 123, 125, 40, 41, 35, 43, 45, 46, 33].forEach(code => {
  _ESCAPE_TABLE[code] = 1
})

function superFast(text: string): string {
  const len = text.length
  let out = ''
  let lastIndex = 0
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i)
    if (code < 128 && _ESCAPE_TABLE[code] === 1) {
      if (i > lastIndex) {
        out += text.substring(lastIndex, i) + '\\' + text[i]
      } else {
        out += '\\' + text[i]
      }
      lastIndex = i + 1
    }
  }
  if (lastIndex < len) out += text.substring(lastIndex)
  return out || text
}

const _ENCODER = new TextEncoder()
const _DECODER = new TextDecoder()
const _SRC_BUF = new Uint8Array(65536)
const _DST_BUF = new Uint8Array(65536 * 2)

function godMode(text: string): string {
  const encoded = _ENCODER.encodeInto(text, _SRC_BUF)
  const srcLen = encoded.written
  if (srcLen === 0) return text
  let destIdx = 0
  for (let i = 0; i < srcLen; i++) {
    const byte = _SRC_BUF[i]
    if (byte < 128 && _ESCAPE_TABLE[byte] === 1) {
      _DST_BUF[destIdx++] = 92
    }
    _DST_BUF[destIdx++] = byte
  }
  return _DECODER.decode(_DST_BUF.subarray(0, destIdx))
}

function scanBuild(text: string): string {
  const encoded = _ENCODER.encodeInto(text, _SRC_BUF)
  const srcLen = encoded.written
  if (srcLen === 0) return text
  let out = ''
  let last = 0
  for (let i = 0; i < srcLen; i++) {
    if (_ESCAPE_TABLE[_SRC_BUF[i]]) {
      if (i > last) out += text.substring(last, i)
      out += '\\'
      out += text[i]
      last = i + 1
    }
  }
  if (last < srcLen) out += text.substring(last)
  return out
}

function regexReplace(text: string): string {
  return text.replace(/([\\*_`\[\]{}()#+\-\.!])/g, '\\$1')
}

function matchAllForOf(text: string): string {
  let out = ''
  let last = 0
  for (const match of text.matchAll(_ESCAPE_RE)) {
    out += text.substring(last, match.index)
    out += '\\'
    out += match[0]
    last = match.index + 1
  }
  out += text.substring(last)
  return out
}

function execBuffer(text: string): string {
  const encoded = _ENCODER.encodeInto(text, _SRC_BUF)
  const srcLen = encoded.written
  if (srcLen === 0) return text
  _ESCAPE_RE.lastIndex = 0
  let destIdx = 0
  let lastByte = 0
  let match: RegExpExecArray | null
  while ((match = _ESCAPE_RE.exec(text)) !== null) {
    const mOff = match.index
    if (mOff > lastByte) {
      const segLen = mOff - lastByte
      _DST_BUF.set(_SRC_BUF.subarray(lastByte, mOff), destIdx)
      destIdx += segLen
    }
    _DST_BUF[destIdx++] = 92
    _DST_BUF[destIdx++] = _SRC_BUF[mOff]
    lastByte = mOff + 1
  }
  if (lastByte < srcLen) {
    const segLen = srcLen - lastByte
    _DST_BUF.set(_SRC_BUF.subarray(lastByte, srcLen), destIdx)
    destIdx += segLen
  }
  return _DECODER.decode(_DST_BUF.subarray(0, destIdx))
}

// ---- benchmarks ----

using g1 = bench.group("escapeMarkdown: 9 variants  (0% special chars)")

const p = "hello world this is plain text with no special characters".repeat(200)
bench("production (hybrid)", () => { escapeMarkdown(p) })
bench("loop (Set.has)", () => { loopSet(p) })
bench("regex (.replace)", () => { regexReplace(p) })
bench("matchAll (for..of)", () => { matchAllForOf(p) })
bench("exec (while loop)", () => { execWhile(p) })
bench("superFast (Uint8Array+slice)", () => { superFast(p) })
bench("godMode (decode buffer)", () => { godMode(p) })
bench("scanBuild (encode+substring)", () => { scanBuild(p) })
bench("execBuffer (exec+encoder)", () => { execBuffer(p) })

using g2 = bench.group("escapeMarkdown: 9 variants  (1% special chars)")

const sp = ("a".repeat(99) + "*").repeat(200)
bench("production (hybrid)", () => { escapeMarkdown(sp) })
bench("loop (Set.has)", () => { loopSet(sp) })
bench("regex (.replace)", () => { regexReplace(sp) })
bench("matchAll (for..of)", () => { matchAllForOf(sp) })
bench("exec (while loop)", () => { execWhile(sp) })
bench("superFast (Uint8Array+slice)", () => { superFast(sp) })
bench("godMode (decode buffer)", () => { godMode(sp) })
bench("scanBuild (encode+substring)", () => { scanBuild(sp) })
bench("execBuffer (exec+encoder)", () => { execBuffer(sp) })

using g3 = bench.group("escapeMarkdown: 9 variants  (5% special chars)")

const m = "hello_world *foo* [bar] #baz +qux -quux !thing `code` and some plain text here".repeat(50)
bench("production (hybrid)", () => { escapeMarkdown(m) })
bench("loop (Set.has)", () => { loopSet(m) })
bench("regex (.replace)", () => { regexReplace(m) })
bench("matchAll (for..of)", () => { matchAllForOf(m) })
bench("exec (while loop)", () => { execWhile(m) })
bench("superFast (Uint8Array+slice)", () => { superFast(m) })
bench("godMode (decode buffer)", () => { godMode(m) })
bench("scanBuild (encode+substring)", () => { scanBuild(m) })
bench("execBuffer (exec+encoder)", () => { execBuffer(m) })

using g4 = bench.group("escapeMarkdown: 9 variants  (50% special chars)")

const d = "\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`".repeat(100)
bench("production (hybrid)", () => { escapeMarkdown(d) })
bench("loop (Set.has)", () => { loopSet(d) })
bench("regex (.replace)", () => { regexReplace(d) })
bench("matchAll (for..of)", () => { matchAllForOf(d) })
bench("exec (while loop)", () => { execWhile(d) })
bench("superFast (Uint8Array+slice)", () => { superFast(d) })
bench("godMode (decode buffer)", () => { godMode(d) })
bench("scanBuild (encode+substring)", () => { scanBuild(d) })
bench("execBuffer (exec+encoder)", () => { execBuffer(d) })
