import { bench } from "benchik"
import { processText } from "../src/utils.ts"

const SEP = "\x00"

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

using g2 = bench.group("Many texts, few escapes (200 texts)")
bench("individual (processText each)", () => individual(docTexts))
bench("batched (split+filter)", () => batched(docTexts))
bench("batched (indexOf+slice)", () => batchedManual(docTexts))
bench("batched+fused (walk+push)", () => batchedFused(docTexts))

using g3 = bench.group("All plain (500 texts)")
bench("individual (processText each)", () => individual(plainTexts))
bench("batched (split+filter)", () => batched(plainTexts))
bench("batched (indexOf+slice)", () => batchedManual(plainTexts))
bench("batched+fused (walk+push)", () => batchedFused(plainTexts))

using g4 = bench.group("Mixed (300 texts)")
bench("individual (processText each)", () => individual(mixedTexts))
bench("batched (split+filter)", () => batched(mixedTexts))
bench("batched (indexOf+slice)", () => batchedManual(mixedTexts))
bench("batched+fused (walk+push)", () => batchedFused(mixedTexts))
