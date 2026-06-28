import { bench } from "benchik"
import { readFileSync } from "fs"
import { collapseWhitespace, collapseTrim, postProcess, extractLanguage, getTextContent, getCodeText } from "../src/utils.ts"

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

using g1 = bench.group("collapseWhitespace")

const wsText = "  hello   world\n\n\nfoo   bar  ".repeat(500)
bench("production (buffer+encode)", () => { collapseWhitespace(wsText) })
bench("loop (for..of+ +=)", () => { collapseLoop(wsText) })

using g2 = bench.group("collapseTrim")

const bigText = "  hello   world\n\n\nfoo   bar  ".repeat(500)
bench("production (regex)", () => { collapseTrim(bigText) })

using g3 = bench.group("postProcess")

const mdText = readFileSync("tests/fixtures/figma-manifest.md", "utf-8")
bench("production (two replace)", () => { postProcess(mdText) })

import { DOMParser } from "linkedom"

using g4 = bench.group("extractLanguage")

const parser = new DOMParser()
const langDoc = parser.parseFromString('<pre class="language-typescript"><code></code></pre>', "text/html")
const langEl = langDoc.documentElement

bench("split+find+slice", () => { extractLanguage(langEl) })

using g5 = bench.group("getTextContent / getCodeText")

const docHtml = readFileSync("tests/fixtures/figma-manifest.html", "utf-8")
const doc = parser.parseFromString(docHtml, "text/html")
const markdownEl = doc.querySelector("div.theme-doc-markdown.markdown")!

bench("getTextContent (96K doc)", () => { getTextContent(markdownEl) })

using g6 = bench.group("getCodeText")

const codeHtml = '<pre><code><span>line1</span><br><span>line2</span></code></pre>'.repeat(100)
const codeDoc = parser.parseFromString(`<html><body>${codeHtml}</body></html>`, "text/html")
bench("getCodeText (100 code blocks)", () => { getCodeText(codeDoc.body) })
