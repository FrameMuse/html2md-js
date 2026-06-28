import { bench } from "benchik"
import { readFileSync } from "fs"
import { DOMParser } from "linkedom"
import { HtmlToMd } from "../src/index.ts"

const parser = new DOMParser()
const FIXTURES = "tests/fixtures"

const pageHtml = readFileSync(`${FIXTURES}/page.html`, "utf-8")
const prereqsHtml = readFileSync(`${FIXTURES}/prerequisites.html`, "utf-8")
const figmaHtml = readFileSync(`${FIXTURES}/figma-manifest.html`, "utf-8")
const mortarHtml = readFileSync(`${FIXTURES}/3mortar-pit.html`, "utf-8")

const pageEl = parser.parseFromString(pageHtml, "text/html").body
const prereqsDoc = parser.parseFromString(prereqsHtml, "text/html")
const prereqsEl = prereqsDoc.querySelector("div.theme-doc-markdown.markdown") ?? prereqsDoc.body
const figmaDoc = parser.parseFromString(figmaHtml, "text/html")
const figmaEl = figmaDoc.querySelector("div.theme-doc-markdown.markdown") ?? figmaDoc.body
const mortarDoc = parser.parseFromString(mortarHtml, "text/html")
const mortarEl = mortarDoc.querySelector("div.theme-doc-markdown.markdown") ?? mortarDoc.body

const SIZE_LABEL: Record<string, string> = {
  page: `${(pageHtml.length / 1024).toFixed(1)}K`,
  prereqs: `${(prereqsHtml.length / 1024).toFixed(1)}K`,
  figma: `${(figmaHtml.length / 1024).toFixed(1)}K`,
  mortar: `${(mortarHtml.length / 1024).toFixed(1)}K`,
}

const dflt = new HtmlToMd()


await bench.untilCompiled()

{
  using g1 = bench.group("Element input (pre-parsed DOM)")

  bench(`page (${SIZE_LABEL.page})`, () => dflt.convert(pageEl))
  bench(`prereqs (${SIZE_LABEL.prereqs})`, () => dflt.convert(prereqsEl))
  bench(`figma (${SIZE_LABEL.figma})`, () => dflt.convert(figmaEl))
  bench(`3mortar (${SIZE_LABEL.mortar})`, () => dflt.convert(mortarEl))
}
