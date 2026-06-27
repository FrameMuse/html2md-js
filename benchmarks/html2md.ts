import { bench } from "benchik"
import { readFileSync } from "fs"
import { htmlToMd, HOIST_IMAGES, HOIST_LINKS, SkipFlags } from "../src/index.ts"
import type { HtmlToMdOptions } from "../src/index.ts"
import { escapeMarkdown, escapeMarkdownWithReplace, collapseWhitespace, collapseTrim } from "../src/utils.ts"
import { DOMParser } from "linkedom"

const parser = new DOMParser()
const FIXTURES = "tests/fixtures"

const pageHtml = readFileSync(`${FIXTURES}/page.html`, "utf-8")
const prereqsHtml = readFileSync(`${FIXTURES}/prerequisites.html`, "utf-8")
const figmaHtml = readFileSync(`${FIXTURES}/figma-manifest.html`, "utf-8")

const pageEl = parser.parseFromString(pageHtml, "text/html").body
const prereqsDoc = parser.parseFromString(prereqsHtml, "text/html")
const prereqsEl = prereqsDoc.querySelector("div.theme-doc-markdown.markdown") ?? prereqsDoc.body
const figmaDoc = parser.parseFromString(figmaHtml, "text/html")
const figmaEl = figmaDoc.querySelector("div.theme-doc-markdown.markdown") ?? figmaDoc.body

const SIZE_LABEL: Record<string, string> = {
  page: `${(pageHtml.length / 1024).toFixed(1)}K`,
  prereqs: `${(prereqsHtml.length / 1024).toFixed(1)}K`,
  figma: `${(figmaHtml.length / 1024).toFixed(1)}K`,
}

const fullOpts: HtmlToMdOptions = {
  codeBy: ["h3.property", ".sig"],
  flags: HOIST_IMAGES | HOIST_LINKS,
  skip: SkipFlags.ARIA_HIDDEN,
}

using g1 = bench.group("Element input (pre-parsed DOM)")

for (const name of ["page", "prereqs", "figma"] as const) {
  const el = { page: pageEl, prereqs: prereqsEl, figma: figmaEl }[name]
  bench(`${name} (${SIZE_LABEL[name]})`, () => { htmlToMd(el) })
  bench(`${name} +full opts`, () => { htmlToMd(el, fullOpts) })
}

using g2 = bench.group("Option breakdown (figma 96.1K)")

bench("default", () => { htmlToMd(figmaEl) })
bench("codeBy only", () => { htmlToMd(figmaEl, { codeBy: ["h3.property", ".sig"] }) })
bench("hoist only", () => { htmlToMd(figmaEl, { flags: HOIST_IMAGES | HOIST_LINKS }) })
bench("skip only", () => { htmlToMd(figmaEl, { skip: SkipFlags.ARIA_HIDDEN }) })

using g3 = bench.group("Synthetic: admonitions x50")

const admonHtml = `<div class="theme-admonition-note"><div class="admonitionContent"><p>Lorem ipsum dolor sit amet.</p></div></div>`.repeat(50)
const admonEl = parser.parseFromString(admonHtml, "text/html").body

bench("element", () => { htmlToMd(admonEl) })

using g4 = bench.group("Synthetic: 10x10 table")

const tableHtml = `<table><thead><tr>${"<th>H</th>".repeat(10)}</tr></thead><tbody>${"<tr>" + "<td>cell</td>".repeat(10) + "</tr>".repeat(10)}</tbody></table>`
const tableEl = parser.parseFromString(tableHtml, "text/html").body

bench("element", () => { htmlToMd(tableEl) })

using g5 = bench.group("Synthetic: code-by x100")

const codeByHtml = "<h3 class=\"property\">annotations: ReadonlyArray&lt;<a href=\"/docs/Annotation/\">Annotation</a>&gt;</h3>".repeat(100)
const codeByEl = parser.parseFromString(codeByHtml, "text/html").body

bench("element", () => { htmlToMd(codeByEl, { codeBy: ["h3.property"] }) })

// ---- escapeMarkdown: loop vs regex ----

using g6 = bench.group("escapeMarkdown: loop vs regex  (0% special chars)")

const plainText = "hello world this is plain text with no special characters".repeat(200)
bench("loop (Set.has)", () => { escapeMarkdown(plainText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(plainText) })

using g7 = bench.group("escapeMarkdown: loop vs regex  (5% special chars)")

const mixedText = "hello_world *foo* [bar] #baz +qux -quux !thing `code` and some plain text here".repeat(50)
bench("loop (Set.has)", () => { escapeMarkdown(mixedText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(mixedText) })

using g8 = bench.group("escapeMarkdown: loop vs regex  (50% special chars)")

const denseText = "\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`".repeat(100)
bench("loop (Set.has)", () => { escapeMarkdown(denseText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(denseText) })

using g9 = bench.group("Internal: collapseWhitespace / collapseTrim")

const wsText = "  hello   world\n\n\nfoo   bar  ".repeat(500)
bench("collapseWhitespace", () => { collapseWhitespace(wsText) })
bench("collapseTrim", () => { collapseTrim(wsText) })
