import { describe, test, expect, beforeAll } from "bun:test"
import { readFileSync } from "fs"
import { htmlToMd, HOIST_IMAGES, HOIST_LINKS, SkipFlags } from "../src/index.ts"
import { DOMParser } from "linkedom"

const parser = new DOMParser()
const FIXTURES = "tests/fixtures"

let docHtml: string
let updateHtml: string

function parse(html: string): Document {
  return parser.parseFromString(html, "text/html")
}

beforeAll(() => {
  docHtml = readFileSync(`${FIXTURES}/prerequisites.html`, "utf-8")
  updateHtml = readFileSync(`${FIXTURES}/update-1.html`, "utf-8")
})

describe("full page snapshots", () => {
  test("prerequisites page", () => {
    const doc = parse(docHtml)
    const el = doc.querySelector("div.theme-doc-markdown.markdown")
    if (!el) throw new Error("selector not found")
    const result = htmlToMd(el, {
      codeBy: ["h3.property", ".sig"],
    })
    expect(result).toMatchSnapshot()
  })

  test("update-1 page", () => {
    const doc = parse(updateHtml)
    const el =
      doc.querySelector("div.theme-doc-markdown.markdown") ??
      doc.querySelector("div#__blog-post-container.markdown")
    if (!el) throw new Error("selector not found")
    const result = htmlToMd(el)
    expect(result).toMatchSnapshot()
  })

  test("figma manifest page", () => {
    const html = readFileSync(`${FIXTURES}/figma-manifest.html`, "utf-8")
    const doc = parse(html)
    const el = doc.querySelector("div.theme-doc-markdown.markdown")
    if (!el) throw new Error("selector not found")
    const result = htmlToMd(el, {
      flags: HOIST_IMAGES | HOIST_LINKS,
      skip: SkipFlags.ARIA_HIDDEN,
      codeBy: ["h3.property", ".sig"],
    })
    expect(result).toMatchSnapshot()
  })

  test("kitchen sink (all features)", () => {
    const html = `<!doctype html><html><body>
      <h1>Kitchen Sink</h1>
      <p>Hello <strong>bold</strong> and <em>highlighted</em> and <i>italic</i> text.</p>
      <p>Link to <a href="https://example.com">example</a> and inline <code>code()</code>.</p>
      <pre><code class="language-ts">const x: number = 1;
console.log(x);</code></pre>
      <pre class="language-py"><code>def hello():
    pass</code></pre>
      <blockquote><p>Blockquote with <strong>bold</strong> inside.</p></blockquote>
      <ul>
        <li>Unordered item 1</li>
        <li>Unordered item 2
          <ul><li>Nested item</li></ul>
        </li>
      </ul>
      <ol start="5">
        <li>Ordered item 5</li>
        <li>Ordered item 6</li>
      </ol>
      <table>
        <thead><tr><th>Name</th><th>Value</th></tr></thead>
        <tbody><tr><td>Alpha</td><td>100</td></tr><tr><td>Beta</td><td>200</td></tr></tbody>
      </table>
      <hr>
      <div class="theme-admonition-tip"><div class="admonitionContent"><p>Tip content here.</p></div></div>
      <figure>
        <figcaption>Figure caption</figcaption>
        <p>Figure body text.</p>
      </figure>
      <address>Author Name</address>
    </body></html>`

    const doc = parse(html)
    const result = htmlToMd(doc.body)
    expect(result).toMatchSnapshot()
  })
})
