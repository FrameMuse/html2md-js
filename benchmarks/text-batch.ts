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
const SEP_BYTE = 0

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

function processTexts(texts: string[]): string[] {
  const out: string[] = []
  let srcLen = 0
  for (let t = 0; t < texts.length; t++) {
    if (t > 0) _SRC_BUF[srcLen++] = SEP_BYTE
    const r = _ENCODER.encodeInto(texts[t], _SRC_BUF.subarray(srcLen))
    srcLen += r.written
  }
  if (!srcLen) return out

  let di = 0
  let segStart = 0
  let prevSpace = false
  for (let i = 0; i < srcLen; i++) {
    const b = _SRC_BUF[i]
    if (b === SEP_BYTE) {
      if (di > segStart) out.push(_DECODER.decode(_DST_BUF.subarray(segStart, di)))
      segStart = di
      prevSpace = false
      continue
    }
    if (b < 128 && _WS_TABLE[b]) {
      if (!prevSpace) { _DST_BUF[di++] = 32; prevSpace = true }
      continue
    }
    prevSpace = false
    if (b < 128 && _ESCAPE_TABLE[b]) _DST_BUF[di++] = 92
    _DST_BUF[di++] = b
  }
  if (di > segStart) out.push(_DECODER.decode(_DST_BUF.subarray(segStart, di)))
  return out
}

function batchedFused(texts: string[]): string[] {
  const joined = texts.join(SEP)
  const processed = processText(joined)
  const result: string[] = []
  let start = 0
  for (let i = 0; i <= processed.length; i++) {
    if (i === processed.length || processed[i] === SEP) {
      if (i > start) result.push(processed.slice(start, i))
      start = i + 1
    }
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
bench("individual (processText each)", () => individual(paragraphTexts))
bench("batched (split+filter)", () => batched(paragraphTexts))
bench("batched (indexOf+slice)", () => batchedManual(paragraphTexts))
bench("batched+fused (walk+push)", () => batchedFused(paragraphTexts))
bench("processTexts (byte-level)", () => processTexts(paragraphTexts))

using g2 = bench.group("Many texts, few escapes (200 texts)")
bench("individual (processText each)", () => individual(docTexts))
bench("batched (split+filter)", () => batched(docTexts))
bench("batched (indexOf+slice)", () => batchedManual(docTexts))
bench("batched+fused (walk+push)", () => batchedFused(docTexts))
bench("processTexts (byte-level)", () => processTexts(docTexts))

using g3 = bench.group("All plain (500 texts)")
bench("individual (processText each)", () => individual(plainTexts))
bench("batched (split+filter)", () => batched(plainTexts))
bench("batched (indexOf+slice)", () => batchedManual(plainTexts))
bench("batched+fused (walk+push)", () => batchedFused(plainTexts))
bench("processTexts (byte-level)", () => processTexts(plainTexts))

using g4 = bench.group("Mixed (300 texts)")
bench("individual (processText each)", () => individual(mixedTexts))
bench("batched (split+filter)", () => batched(mixedTexts))
bench("batched (indexOf+slice)", () => batchedManual(mixedTexts))
bench("batched+fused (walk+push)", () => batchedFused(mixedTexts))
bench("processTexts (byte-level)", () => processTexts(mixedTexts))
