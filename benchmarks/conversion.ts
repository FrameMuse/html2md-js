import { bench } from "benchik"
import { readFileSync } from "fs"
import { HtmlToMd, HOIST_IMAGES, HOIST_LINKS, SkipFlags } from "../src/index.ts"
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

const dflt = new HtmlToMd()
const full = new HtmlToMd({
  codeBy: ["h3.property", ".sig"],
  flags: HOIST_IMAGES | HOIST_LINKS,
  skip: SkipFlags.ARIA_HIDDEN,
})
const codeBy = new HtmlToMd({ codeBy: ["h3.property", ".sig"] })
const hoist = new HtmlToMd({ flags: HOIST_IMAGES | HOIST_LINKS })
const skipOnly = new HtmlToMd({ skip: SkipFlags.ARIA_HIDDEN })
const codeByProp = new HtmlToMd({ codeBy: ["h3.property"] })

await bench.untilCompiled()

{
  using g1 = bench.group("Element input (pre-parsed DOM)")

  for (const name of ["page", "prereqs", "figma"] as const) {
    const el = { page: pageEl, prereqs: prereqsEl, figma: figmaEl }[name]
    bench(`${name} (${SIZE_LABEL[name]})`, () => dflt.convert(el))
    bench(`${name} +full opts`, () => full.convert(el))
  }
}
{
  using g2 = bench.group("Option breakdown (figma 96.1K)")

  bench("default", () => dflt.convert(figmaEl))
  bench("codeBy only", () => codeBy.convert(figmaEl))
  bench("hoist only", () => hoist.convert(figmaEl))
  bench("skip only", () => skipOnly.convert(figmaEl))
}
{
  using g3 = bench.group("Synthetic: admonitions x50")

  const admonHtml = `<div class="theme-admonition-note"><div class="admonitionContent"><p>Lorem ipsum dolor sit amet.</p></div></div>`.repeat(50)
  const admonEl = parser.parseFromString(admonHtml, "text/html").body

  bench("element", () => dflt.convert(admonEl))
}
{
  using g4 = bench.group("Synthetic: 10x10 table")

  const tableHtml = `<table><thead><tr>${"<th>H</th>".repeat(10)}</tr></thead><tbody>${"<tr>" + "<td>cell</td>".repeat(10) + "</tr>".repeat(10)}</tbody></table>`
  const tableEl = parser.parseFromString(tableHtml, "text/html").body

  bench("element", () => dflt.convert(tableEl))
}
{
  using g5 = bench.group("Synthetic: code-by x100")

  const codeByHtml = "<h3 class=\"property\">annotations: ReadonlyArray&lt;<a href=\"/docs/Annotation/\">Annotation</a>&gt;</h3>".repeat(100)
  const codeByEl = parser.parseFromString(codeByHtml, "text/html").body

  bench("element", () => codeByProp.convert(codeByEl))
}