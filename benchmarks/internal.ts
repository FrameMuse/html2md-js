import { bench } from "benchik"
import { collapseWhitespace, collapseTrim } from "../src/utils.ts"

function collapseLoop(text: string): string {
  let out = ''
  let prevSpace = false
  for (const c of text) {
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
      if (!prevSpace) { out += ' '; prevSpace = true }
    } else {
      out += c
      prevSpace = false
    }
  }
  return out
}

using g1 = bench.group("collapseWhitespace: buffer vs loop")

const wsText = "  hello   world\n\n\nfoo   bar  ".repeat(500)
bench("production (buffer+encode)", () => { collapseWhitespace(wsText) })
bench("loop (for..of+ +=)", () => { collapseLoop(wsText) })

using g2 = bench.group("collapseWhitespace: buffer vs loop  (no whitespace)")

const plainText = "hello world this is plain text with no extra whitespace".repeat(200)
bench("production (buffer+encode)", () => { collapseWhitespace(plainText) })
bench("loop (for..of+ +=)", () => { collapseLoop(plainText) })

using g3 = bench.group("collapseTrim")

const bigText = "  hello   world\n\n\nfoo   bar  ".repeat(500)
bench("collapseTrim", () => { collapseTrim(bigText) })
