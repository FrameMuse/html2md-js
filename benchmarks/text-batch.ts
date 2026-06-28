import { bench } from "benchik"
import { processText } from "../src/utils.ts"

const _WS_TABLE = new Uint8Array(128);
[32, 10, 13, 9].forEach(code => { _WS_TABLE[code] = 1 })
const _ESCAPE_TABLE = new Uint8Array(128);
[92, 42, 95, 96, 91, 93, 123, 125, 40, 41, 35, 43, 45, 46, 33].forEach(code => { _ESCAPE_TABLE[code] = 1 })
const _ENCODER = new TextEncoder()
const _DECODER = new TextDecoder()
const _SRC_BUF = new Uint8Array(65536)
const _DST_BUF = new Uint8Array(65536 * 2)

const SEP = "\x00"
const RE_WS = /\s/
const RE_ESCAPE = /[\\*_`\[\]{}()#+\-\.!]/

function processTexts(joined: string): string[] {
  if (!RE_WS.test(joined) && !RE_ESCAPE.test(joined)) return joined.split(SEP).filter(Boolean)

  const srcLen = _ENCODER.encodeInto(joined, _SRC_BUF).written
  let di = 0
  let prevSpace = false

  const boundaries: number[] = []
  for (let i = 0; i < srcLen; i++) {
    const byte = _SRC_BUF[i]
    if (byte === 0) {
      boundaries.push(di)
      prevSpace = false
      continue
    }
    if (byte < 128 && _WS_TABLE[byte]) {
      if (!prevSpace) { _DST_BUF[di++] = 32; prevSpace = true }
      continue
    }
    prevSpace = false
    if (byte < 128 && _ESCAPE_TABLE[byte]) _DST_BUF[di++] = 92
    _DST_BUF[di++] = byte
  }
  boundaries.push(di)

  const all = _DECODER.decode(_DST_BUF.subarray(0, di))
  const segCount = boundaries.length
  const out = new Array<string>(segCount)
  let segStart = 0
  for (let i = 0; i < segCount; i++) {
    const segEnd = boundaries[i]
    if (segEnd > segStart) out[i] = all.slice(segStart, segEnd)
    segStart = segEnd
  }
  return out
}

// ---- baseline variants ----

function individual(texts: string[]): string[] {
  const out: string[] = []
  for (const t of texts) {
    const s = processText(t)
    if (s) out.push(s)
  }
  return out
}

function batched(texts: string[]): string[] {
  const joined = texts.join(SEP)
  const processed = processText(joined)
  return processed.split(SEP).filter(Boolean)
}

function batchedManual(texts: string[]): string[] {
  const joined = texts.join(SEP)
  const processed = processText(joined)
  const result: string[] = []
  let start = 0
  while (true) {
    const idx = processed.indexOf(SEP, start)
    if (idx === -1) {
      if (start < processed.length) result.push(processed.slice(start))
      break
    }
    if (idx > start) result.push(processed.slice(start, idx))
    start = idx + 1
  }
  return result
}

// ---- test data ----

const paragraphTexts = [
  "Hello world",
  " and ",
  "bold",
  " text with ",
  "special_characters!",
  " and some more ",
  "plain text here",
]

const docTexts: string[] = []
for (let i = 0; i < 200; i++) {
  docTexts.push("some regular text content ")
  docTexts.push("with ")
  docTexts.push("a_few_escaped_chars")
}

const plainTexts: string[] = []
for (let i = 0; i < 500; i++) {
  plainTexts.push("hello world this is plain text with no special characters ")
}

const mixedTexts: string[] = []
for (let i = 0; i < 100; i++) {
  mixedTexts.push("plain regular text ")
  mixedTexts.push("text_ with _escapes!")
  mixedTexts.push("more plain ")
}

// ---- benchmarks ----

using g1 = bench.group("Paragraph-sized (7 texts)")
const pJoined = paragraphTexts.join(SEP)
bench("individual (processText each)", () => individual(paragraphTexts))
bench("batched (split+filter)", () => batched(paragraphTexts))
bench("batched (indexOf+slice)", () => batchedManual(paragraphTexts))
bench("processTexts (boundaries)", () => processTexts(pJoined))

using g2 = bench.group("Many texts, few escapes (200 texts)")
const dJoined = docTexts.join(SEP)
bench("individual (processText each)", () => individual(docTexts))
bench("batched (split+filter)", () => batched(docTexts))
bench("batched (indexOf+slice)", () => batchedManual(docTexts))
bench("processTexts (boundaries)", () => processTexts(dJoined))

using g3 = bench.group("All plain (500 texts)")
const plJoined = plainTexts.join(SEP)
bench("individual (processText each)", () => individual(plainTexts))
bench("batched (split+filter)", () => batched(plainTexts))
bench("batched (indexOf+slice)", () => batchedManual(plainTexts))
bench("processTexts (boundaries)", () => processTexts(plJoined))

using g4 = bench.group("Mixed (300 texts)")
const mJoined = mixedTexts.join(SEP)
bench("individual (processText each)", () => individual(mixedTexts))
bench("batched (split+filter)", () => batched(mixedTexts))
bench("batched (indexOf+slice)", () => batchedManual(mixedTexts))
bench("processTexts (boundaries)", () => processTexts(mJoined))
