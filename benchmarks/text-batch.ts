import { bench } from "benchik"
import { processText } from "../src/utils.ts"

function individual(texts: string[]): string[] {
  const out: string[] = []
  for (const t of texts) {
    const s = processText(t)
    if (s) out.push(s)
  }
  return out
}

const SEP = "\x00"

function batched(texts: string[]): string[] {
  const joined = texts.join(SEP)
  const processed = processText(joined)
  return processed.split(SEP).filter(Boolean)
}

function batchedSmart(texts: string[]): string[] {
  let needs = false
  for (const t of texts) {
    if (t && (/\s/.test(t) || /[\\*_`\[\]{}()#+\-\.!]/.test(t))) { needs = true; break }
  }
  if (!needs) return texts.filter(Boolean)

  const joined = texts.join(SEP)
  const processed = processText(joined)
  return processed.split(SEP).filter(Boolean)
}

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

using g1 = bench.group("Paragraph-sized (7 texts)")
bench("individual (processText each)", () => individual(paragraphTexts))
bench("batched (join+split)", () => batched(paragraphTexts))
bench("batched+smart (test+join+split)", () => batchedSmart(paragraphTexts))

using g2 = bench.group("Many texts, few escapes (200 texts)")
bench("individual (processText each)", () => individual(docTexts))
bench("batched (join+split)", () => batched(docTexts))
bench("batched+smart (test+join+split)", () => batchedSmart(docTexts))

using g3 = bench.group("All plain (500 texts)")
bench("individual (processText each)", () => individual(plainTexts))
bench("batched (join+split)", () => batched(plainTexts))
bench("batched+smart (test+join+split)", () => batchedSmart(plainTexts))

using g4 = bench.group("Mixed (300 texts)")
bench("individual (processText each)", () => individual(mixedTexts))
bench("batched (join+split)", () => batched(mixedTexts))
bench("batched+smart (test+join+split)", () => batchedSmart(mixedTexts))
