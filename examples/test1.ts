import { DOMParser } from "linkedom"
import { HtmlToMd } from "../src/index.ts"

import figmaHtml from "../tests/fixtures/3mortar-pit.html" with { type: "text" }

const domParser = new DOMParser
const figmaDoc = domParser.parseFromString(figmaHtml, "text/html")
const figmaEl = figmaDoc.querySelector("div.theme-doc-markdown.markdown") ?? figmaDoc.body

const dflt = new HtmlToMd
console.log(dflt.convert(figmaEl))
