import { bench } from "benchik"

const SEP = "\x00"

function splitFilter(s: string): string[] {
  return s.split(SEP).filter(Boolean)
}

function splitManual(s: string): string[] {
  const result: string[] = []
  let start = 0
  while (true) {
    const idx = s.indexOf(SEP, start)
    if (idx === -1) {
      if (start < s.length) result.push(s.slice(start))
      break
    }
    if (idx > start) result.push(s.slice(start, idx))
    start = idx + 1
  }
  return result
}

function splitForLoop(s: string): string[] {
  const result: string[] = []
  let start = 0
  for (let i = 0; i <= s.length; i++) {
    if (i === s.length || s[i] === SEP) {
      if (i > start) result.push(s.slice(start, i))
      start = i + 1
    }
  }
  return result
}

function splitBuffer(s: string): string[] {
  const result: string[] = []
  let buf = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === SEP) {
      if (buf) { result.push(buf); buf = '' }
    } else {
      buf += s[i]
    }
  }
  if (buf) result.push(buf)
  return result
}

// ---- test data ----

const texts: string[] = []
for (let i = 0; i < 300; i++) {
  if (i % 3 === 0) texts.push("plain regular text here ")
  else if (i % 3 === 1) texts.push("text_with _escaped_ chars!")
  else texts.push("more _plain_ text ")
}

const joined = texts.join(SEP)

using g1 = bench.group("split(SEP) — 300 segments")
bench("split + filter", () => splitFilter(joined))
bench("indexOf + slice", () => splitManual(joined))
bench("for loop + charAt", () => splitForLoop(joined))
bench("buffer (+=)", () => splitBuffer(joined))
