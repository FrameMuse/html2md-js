import { describe, test, expect } from "bun:test"
import { HtmlToMd, HOIST_IMAGES, HOIST_LINKS, SkipFlags } from "../src/index.ts"
import type { HtmlToMdOptions } from "../src/index.ts"
import { parseCodeByRule } from "../src/options.ts"
import type { CodeByRule, ElementLike } from "../src/options.ts"
import { matchesCodeBy, processText, collapseTrim, postProcess } from "../src/utils.ts"
import { DOMParser } from "linkedom"

const parser = new DOMParser()

function el(html: string): ElementLike {
  const doc = parser.parseFromString(`<html><body>${html}</body></html>`, "text/html")
  return doc.body
}

const convert = (el: ElementLike, opts?: HtmlToMdOptions) => new HtmlToMd(opts).convert(el)

describe("paragraphs", () => {
  test("simple paragraph", () => {
    expect(convert(el("<p>Hello World</p>"))).toBe("Hello World")
  })

  test("two paragraphs", () => {
    expect(convert(el("<p>First</p><p>Second</p>"))).toBe("First\n\nSecond")
  })

  test("empty paragraph", () => {
    expect(convert(el("<p></p>"))).toBe("")
  })
})

describe("headings", () => {
  test("h1", () => {
    expect(convert(el("<h1>Title</h1>"))).toBe("# Title")
  })

  test("h2", () => {
    expect(convert(el("<h2>Section</h2>"))).toBe("## Section")
  })

  test("h3", () => {
    expect(convert(el("<h3>Sub</h3>"))).toBe("### Sub")
  })
})

describe("bold and italic", () => {
  test("bold via strong", () => {
    expect(convert(el("<strong>bold</strong>"))).toBe("**bold**")
  })

  test("bold via b", () => {
    expect(convert(el("<b>bold</b>"))).toBe("**bold**")
  })

  test("italic via i", () => {
    expect(convert(el("<i>italic</i>"))).toBe("_italic_")
  })

  test("emphasis via em is highlight", () => {
    expect(convert(el("<em>highlight</em>"))).toBe("==highlight==")
  })
})

describe("links", () => {
  test("basic link", () => {
    expect(convert(el('<a href="https://example.com">Example</a>'))).toBe(
      "[Example](https://example.com)",
    )
  })

  test("link with title", () => {
    expect(
      convert(el('<a href="https://example.com" title="Example Site">Example</a>')),
    ).toBe('[Example](https://example.com "Example Site")')
  })

  test("link without href is plain text", () => {
    expect(convert(el("<a>Nothing</a>"))).toBe("Nothing")
  })
})

describe("images", () => {
  test("basic image", () => {
    expect(convert(el('<img src="image.png" alt="Alt">'))).toBe("![Alt](image.png)")
  })

  test("image with title", () => {
    expect(
      convert(el('<img src="image.png" alt="Alt" title="Photo">')),
    ).toBe('![Alt](image.png "Photo")')
  })

  test("image without src is skipped", () => {
    expect(convert(el('<img alt="Alt">'))).toBe("")
  })
})

describe("inline code", () => {
  test("basic code", () => {
    expect(convert(el("<code>code</code>"))).toBe("`code`")
  })

  test("code with backticks", () => {
    expect(convert(el("<code>`code`</code>"))).toBe("`` `code` ``")
  })

  test("code with leading backtick", () => {
    expect(convert(el("<code>`test</code>"))).toBe("`` `test ``")
  })
})

describe("horizontal rule", () => {
  test("hr", () => {
    expect(convert(el("<hr>"))).toBe("---")
  })
})

describe("unordered lists", () => {
  test("basic ul", () => {
    expect(convert(el("<ul><li>One</li><li>Two</li></ul>"))).toBe("- One\n- Two")
  })
})

describe("ordered lists", () => {
  test("basic ol", () => {
    expect(convert(el("<ol><li>First</li><li>Second</li></ol>"))).toBe("1.  First\n2.  Second")
  })
})

describe("blockquotes", () => {
  test("basic blockquote", () => {
    expect(convert(el("<blockquote><p>Quote</p></blockquote>"))).toBe("> Quote")
  })
})

describe("code blocks", () => {
  test("pre code with language", () => {
    expect(convert(
      el('<pre><code class="language-ts">let x = 1;</code></pre>'),
    )).toBe("```ts\nlet x = 1;\n```")
  })

  test("pre code without language", () => {
    expect(convert(el("<pre><code>let x = 1;</code></pre>"))).toBe("```\nlet x = 1;\n```")
  })

  test("language propagation from pre to code", () => {
    expect(convert(
      el('<pre class="language-js"><code>const a = 1;</code></pre>'),
    )).toBe("```js\nconst a = 1;\n```")
  })

  test("pre code with br inside span preserves newlines", () => {
    expect(convert(
      el('<pre><code><span>line1</span><br><span>line2</span></code></pre>'),
    )).toBe("```\nline1\nline2\n```")
  })

  test("prism-code with span/br multiline", () => {
    expect(convert(
      el('<pre class="prism-code language-json"><code><span class="token-line"><span class="token punctuation">[</span></span><br><span class="token-line"><span class="token punctuation">]</span></span></code></pre>'),
    )).toBe("```json\n[\n]\n```")
  })
})

describe("tables", () => {
  test("simple table", () => {
    expect(convert(
      el("<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"),
    )).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |")
  })

  test("infobox table with colspan th and td values", () => {
    expect(convert(
      el(`<table>
        <tr><th colspan="2">Stats</th></tr>
        <tr><th>Army</th><td>British</td></tr>
        <tr><th>Health</th><td>395</td></tr>
      </table>`),
    )).toBe("| Stats | |\n| --- | --- |\n| Army | British |\n| Health | 395 |")
  })
})

describe("admonitions", () => {
  test("note admonition", () => {
    expect(convert(
      el('<div class="theme-admonition-note"><div class="admonitionContent"><p>Note content</p></div></div>'),
    )).toBe("> [!NOTE]\n> \n> Note content")
  })

  test("warning admonition", () => {
    expect(convert(
      el('<div class="theme-admonition-warning"><div class="admonitionContent"><p>Warning!</p></div></div>'),
    )).toBe("> [!WARNING]\n> \n> Warning\\!")
  })
})

describe("code-by feature", () => {
  test("code-by wraps text in backticks, splits around links", () => {
    expect(convert(
      el('<h3 class="property">annotations: ReadonlyArray&lt;<a href="/docs/Annotation/">Annotation</a>&gt;</h3>'),
      { codeBy: ["h3.property"] },
    )).toBe("### `annotations: ReadonlyArray<`[Annotation](/docs/Annotation/)`>`")
  })

  test("code-by preserves links inside code split", () => {
    expect(convert(
      el('<h3 class="property"><a href="/docs/api/foo/"><code>foo</code></a>: <a href="/docs/api/Bar/"><code>Bar</code></a></h3>'),
      { codeBy: ["h3.property"] },
    )).toBe("### [`foo`](/docs/api/foo/)`: `[`Bar`](/docs/api/Bar/)")
  })

  test("code-by no match when class absent", () => {
    expect(convert(el("<h3>plain heading</h3>"), { codeBy: ["h3.property"] })).toBe("### plain heading")
  })

  test("code-by with class-only selector on paragraph", () => {
    expect(convert(
      el('<p class="sig">fn(x: number): string</p>'),
      { codeBy: [".sig"] },
    )).toBe("`fn(x: number): string`")
  })

  test("code-by with tag-only selector", () => {
    expect(convert(
      el('<h4>SomeType</h4>'),
      { codeBy: ["h4"] },
    )).toBe("#### `SomeType`")
  })

  test("code-by multiple rules", () => {
    expect(convert(
      el('<h3 class="property">Foo</h3><p class="sig">Bar</p>'),
      { codeBy: ["h3.property", ".sig"] },
    )).toBe("### `Foo`\n\n`Bar`")
  })

  test("code-by with empty option does nothing", () => {
    expect(convert(el("<h3>heading</h3>"), { codeBy: [] })).toBe("### heading")
  })

  test("code-by no match when class is present but wrong", () => {
    expect(convert(
      el('<h3 class="other">heading</h3>'),
      { codeBy: ["h3.property"] },
    )).toBe("### heading")
  })

  test("code-by empty element produces nothing", () => {
    expect(convert(el('<h3 class="property"></h3>'), { codeBy: ["h3.property"] })).toBe("")
  })

  test("code-by with backticks in text uses double-backtick delimiters", () => {
    expect(convert(
      el('<h3 class="property">x &gt; `y` &lt; z</h3>'),
      { codeBy: ["h3.property"] },
    )).toBe("### ``x > `y` < z``")
  })
})

describe("parseCodeByRule", () => {
  test('"tag.class" returns tag and class', () => {
    const r = parseCodeByRule("h3.property")
    expect(r).toEqual({ tag: "h3", class: "property" })
  })

  test('".class" returns null tag and class', () => {
    const r = parseCodeByRule(".sig")
    expect(r).toEqual({ tag: null, class: "sig" })
  })

  test('"tag" returns tag and null class', () => {
    const r = parseCodeByRule("h4")
    expect(r).toEqual({ tag: "h4", class: null })
  })

  test('"." returns null for both tag and class (empty cls is coerced to null)', () => {
    const r = parseCodeByRule(".")
    expect(r).toEqual({ tag: null, class: null })
  })

  test('"tag." returns tag and null class (empty cls is coerced to null)', () => {
    const r = parseCodeByRule("h3.")
    expect(r).toEqual({ tag: "h3", class: null })
  })

  test('"tag.class.sub" splits at first dot', () => {
    const r = parseCodeByRule("h3.foo.bar")
    expect(r).toEqual({ tag: "h3", class: "foo.bar" })
  })
})

describe("matchesCodeBy", () => {
  function makeEl(tag: string, cls: string | null): ElementLike {
    const doc = new DOMParser().parseFromString(
      `<html><body><${tag}${cls ? ` class="${cls}"` : ""}></${tag}></body></html>`,
      "text/html",
    )
    return doc.body.firstChild as ElementLike
  }

  test("matches by tag only", () => {
    const rules: CodeByRule[] = [{ tag: "h3", class: null }]
    expect(matchesCodeBy(makeEl("h3", null), rules)).toBe(true)
  })

  test("matches by class only", () => {
    const rules: CodeByRule[] = [{ tag: null, class: "sig" }]
    expect(matchesCodeBy(makeEl("p", "sig"), rules)).toBe(true)
  })

  test("matches by tag and class", () => {
    const rules: CodeByRule[] = [{ tag: "h3", class: "property" }]
    expect(matchesCodeBy(makeEl("h3", "property"), rules)).toBe(true)
  })

  test("no match when tag differs", () => {
    const rules: CodeByRule[] = [{ tag: "h3", class: null }]
    expect(matchesCodeBy(makeEl("h4", null), rules)).toBe(false)
  })

  test("no match when class differs", () => {
    const rules: CodeByRule[] = [{ tag: null, class: "sig" }]
    expect(matchesCodeBy(makeEl("p", "other"), rules)).toBe(false)
  })

  test("no match when class absent and rule has class", () => {
    const rules: CodeByRule[] = [{ tag: null, class: "sig" }]
    expect(matchesCodeBy(makeEl("p", null), rules)).toBe(false)
  })

  test("matches one of several classes", () => {
    const rules: CodeByRule[] = [{ tag: null, class: "sig" }]
    expect(matchesCodeBy(makeEl("p", "foo sig bar"), rules)).toBe(true)
  })

  test("second rule matches when first does not", () => {
    const rules: CodeByRule[] = [
      { tag: "h3", class: null },
      { tag: null, class: "sig" },
    ]
    expect(matchesCodeBy(makeEl("p", "sig"), rules)).toBe(true)
  })

  test("empty rules returns false", () => {
    expect(matchesCodeBy(makeEl("h3", null), [])).toBe(false)
  })
})

describe("links-in-code", () => {
  test("link inside code splits code span around link", () => {
    expect(convert(
      el('<p><code>use <a href="/docs/Foo/">Foo</a> from bar</code></p>'),
    )).toBe("`use `[Foo](/docs/Foo/)` from bar`")
  })
})

describe("figcaption and address", () => {
  test("figcaption becomes italic", () => {
    expect(convert(el("<figcaption>Caption</figcaption>"))).toBe("_Caption_")
  })

  test("address becomes bold", () => {
    expect(convert(el("<address>Author</address>"))).toBe("**Author**")
  })
})

describe("form and fieldset are skipped", () => {
  test("form is skipped", () => {
    expect(convert(el("<form>content</form>"))).toBe("")
  })

  test("fieldset is skipped", () => {
    expect(convert(el("<fieldset>content</fieldset>"))).toBe("")
  })
})

describe("interactive elements are skipped", () => {
  test("button is skipped", () => {
    expect(convert(el("<button>Click</button>"))).toBe("")
  })

  test("input is skipped", () => {
    expect(convert(el('<input type="text" value="hello">'))).toBe("")
  })

  test("select is skipped", () => {
    expect(convert(el("<select><option>A</option></select>"))).toBe("")
  })

  test("textarea is skipped", () => {
    expect(convert(el("<textarea>text</textarea>"))).toBe("")
  })
})

describe("es carp ing", () => {
  test("asterisks escaped", () => {
    expect(convert(el("<p>3 * 4 = 12</p>"))).toBe("3 \\* 4 = 12")
  })

  test("underscores escaped", () => {
    expect(convert(el("<p>_hello_</p>"))).toBe("\\_hello\\_")
  })

  test("backticks escaped", () => {
    expect(convert(el("<p>`code`</p>"))).toBe("\\`code\\`")
  })

  test("inline code is not escaped", () => {
    expect(convert(el("<p>inline <code>_code_</code> here</p>"))).toBe(
      "inline `_code_` here",
    )
  })

  test("code blocks are not escaped", () => {
    expect(convert(el("<pre><code>*bold*</code></pre>"))).toBe("```\n*bold*\n```")
  })
})

describe("whitespace", () => {
  test("multiline text collapses", () => {
    expect(convert(el("<p>Hello\n\nWorld</p>"))).toBe("Hello World")
  })

  test("multiple spaces collapse", () => {
    expect(convert(el("<p>Hello    World</p>"))).toBe("Hello World")
  })

  test("whitespace preserved in pre", () => {
    expect(convert(el("<pre><code>  spaced  </code></pre>"))).toBe("```\n  spaced  \n```")
  })
})

describe("post-processing", () => {
  test("hash-link anchors stripped", () => {
    expect(convert(el('<a href="#section">​</a>'))).toBe("")
  })
})

describe("image hoisting", () => {
  test("hoists single image", () => {
    expect(convert(
      el('<img src="cat.png" alt="Cat">'),
      { flags: HOIST_IMAGES },
    )).toBe("![Cat][img0]\n\n[img0]: cat.png\n")
  })

  test("hoists image with title", () => {
    expect(convert(
      el('<img src="cat.png" alt="Cat" title="A cat">'),
      { flags: HOIST_IMAGES },
    )).toBe('![Cat][img0]\n\n[img0]: cat.png "A cat"\n')
  })

  test("dedup same url", () => {
    expect(convert(
      el('<p><img src="cat.png" alt="Cat"><img src="cat.png" alt="Same cat"></p>'),
      { flags: HOIST_IMAGES },
    )).toBe("![Cat][img0]![Same cat][img0]\n\n[img0]: cat.png\n")
  })

  test("different urls get different refs", () => {
    expect(convert(
      el('<p><img src="a.png" alt="A"><img src="b.png" alt="B"></p>'),
      { flags: HOIST_IMAGES },
    )).toBe("![A][img0]![B][img1]\n\n[img0]: a.png\n[img1]: b.png\n")
  })

  test("default flags does not hoist", () => {
    expect(convert(el('<img src="cat.png" alt="Cat">'))).toBe("![Cat](cat.png)")
  })
})

describe("link hoisting", () => {
  test("hoists single link", () => {
    expect(convert(
      el('<a href="https://x.com">X</a>'),
      { flags: HOIST_LINKS },
    )).toBe("[X][ref0]\n\n[ref0]: https://x.com\n")
  })

  test("dedup same url", () => {
    expect(convert(
      el('<p><a href="https://x.com">X</a> <a href="https://x.com">Y</a></p>'),
      { flags: HOIST_LINKS },
    )).toBe("[X][ref0] [Y][ref0]\n\n[ref0]: https://x.com\n")
  })

  test("link with title different from content", () => {
    expect(convert(
      el('<a href="https://x.com" title="The X">X</a>'),
      { flags: HOIST_LINKS },
    )).toBe('[X][ref0]\n\n[ref0]: https://x.com "The X"\n')
  })

  test("link with title matching content", () => {
    expect(convert(
      el('<a href="/wiki/British" title="British">British</a>'),
      { flags: HOIST_LINKS },
    )).toBe("[British][ref0]\n\n[ref0]: /wiki/British\n")
  })

  test("HOIST_IMAGES | HOIST_LINKS both work", () => {
    expect(convert(
      el('<p><a href="https://x.com"><img src="cat.png" alt="Cat"></a></p>'),
      { flags: HOIST_IMAGES | HOIST_LINKS },
    )).toBe("[![Cat][img0]][ref1]\n\n[img0]: cat.png\n[ref1]: https://x.com\n")
  })
})

describe("skip flags", () => {
  test("block-level aria-hidden skipped", () => {
    expect(convert(
      el('<p>Visible</p><div aria-hidden="true"><p>Hidden</p></div>'),
      { skip: SkipFlags.ARIA_HIDDEN },
    )).toBe("Visible")
  })

  test("inline-level aria-hidden skipped (e.g. svg icon inside link)", () => {
    expect(convert(
      el('<p>text <a href="/edit"><svg aria-hidden="true"><use href="#icon"></use></svg>Edit</a></p>'),
      { skip: SkipFlags.ARIA_HIDDEN },
    )).toBe("text [Edit](/edit)")
  })

  test("inline aria-hidden alone produces empty anchor (no content)", () => {
    expect(convert(
      el('<p>text <a href="/edit"><svg aria-hidden="true"><use href="#icon"></use></svg></a></p>'),
      { skip: SkipFlags.ARIA_HIDDEN },
    )).toBe("text ")
  })

  test("aria-hidden inside table cell skipped", () => {
    expect(convert(
      el('<table><tr><td>Keep <svg aria-hidden="true"><use href="#x"></use></svg> this</td></tr></table>'),
      { skip: SkipFlags.ARIA_HIDDEN },
    )).toBe("| Keep  this |\n| --- |")
  })

  test("aria-hidden elements preserved without skip flag", () => {
    expect(convert(
      el('<div aria-hidden="true"><p>Hidden</p></div>'),
    )).toBe("Hidden")
  })

  test("header skipped with SkipFlags.HEADER", () => {
    expect(convert(el("<header>Brand</header><p>Body</p>"), { skip: SkipFlags.HEADER })).toBe("Body")
  })

  test("footer skipped with SkipFlags.FOOTER", () => {
    expect(convert(el("<p>Body</p><footer>Copyright</footer>"), { skip: SkipFlags.FOOTER })).toBe("Body")
  })

  test("aside skipped with SkipFlags.ASIDE", () => {
    expect(convert(el("<aside>Sidebar</aside><p>Main</p>"), { skip: SkipFlags.ASIDE })).toBe("Main")
  })

  test("nav skipped with SkipFlags.NAV", () => {
    expect(convert(el("<nav>Links</nav><p>Content</p>"), { skip: SkipFlags.NAV })).toBe("Content")
  })

  test("menu skipped with SkipFlags.MENU", () => {
    expect(convert(el("<menu><li>Item</li></menu><p>Body</p>"), { skip: SkipFlags.MENU })).toBe("Body")
  })

  test("tags preserved without skip flag", () => {
    expect(convert(el("<header>Brand</header><p>Body</p>"))).toBe("Brand\n\nBody")
  })

  test("multiple skip flags combined", () => {
    expect(convert(
      el("<header>H</header><nav>N</nav><p>Body</p><footer>F</footer>"),
      { skip: SkipFlags.HEADER | SkipFlags.FOOTER | SkipFlags.NAV },
    )).toBe("Body")
  })
})

describe("headingStyle option", () => {
  test("setext style for h1 uses underline", () => {
    expect(convert(el("<h1>Title</h1>"), { headingStyle: "setext" })).toBe("Title\n=====")
  })

  test("setext style for h2 uses dashes", () => {
    expect(convert(el("<h2>Section</h2>"), { headingStyle: "setext" })).toBe("Section\n-------")
  })

  test("setext style for h3+ still uses atx prefix", () => {
    expect(convert(el("<h3>Sub</h3>"), { headingStyle: "setext" })).toBe("### Sub")
  })

  test("setext underline length matches text", () => {
    expect(convert(el("<h1>Longer Title</h1>"), { headingStyle: "setext" })).toBe("Longer Title\n============")
  })

  test("default headingStyle is atx", () => {
    expect(convert(el("<h1>Title</h1>"))).toBe("# Title")
  })
})

describe("codeBlockStyle option", () => {
  test("indented style uses 4-space indent", () => {
    expect(convert(
      el("<pre>let x = 1;\nconst y = 2;</pre>"),
      { codeBlockStyle: "indented" },
    )).toBe("    let x = 1;\n    const y = 2;")
  })

  test("indented style with language class on pre", () => {
    expect(convert(
      el('<pre class="language-ts">let x = 1;</pre>'),
      { codeBlockStyle: "indented" },
    )).toBe("    let x = 1;")
  })

  test("default codeBlockStyle is fenced", () => {
    expect(convert(el("<pre><code>code</code></pre>"))).toBe("```\ncode\n```")
  })
})

describe("bulletListMarker option", () => {
  test("asterisk marker", () => {
    expect(convert(el("<ul><li>A</li><li>B</li></ul>"), { bulletListMarker: "*" })).toBe("* A\n* B")
  })

  test("plus marker", () => {
    expect(convert(el("<ul><li>A</li><li>B</li></ul>"), { bulletListMarker: "+" })).toBe("+ A\n+ B")
  })
})

describe("hr option", () => {
  test("custom hr string", () => {
    expect(convert(el("<hr>"), { hr: "***" })).toBe("***")
  })

  test("underscore hr", () => {
    expect(convert(el("<hr>"), { hr: "___" })).toBe("___")
  })
})

describe("emDelimiter option", () => {
  test("custom emphasis on i tag", () => {
    expect(convert(el("<i>italic</i>"), { emDelimiter: "*" })).toBe("*italic*")
  })

  test("em tag still uses highlight regardless of emDelimiter", () => {
    expect(convert(el("<em>highlight</em>"), { emDelimiter: "*" })).toBe("==highlight==")
  })
})

describe("strongDelimiter option", () => {
  test("underscore bold", () => {
    expect(convert(el("<strong>bold</strong>"), { strongDelimiter: "__" })).toBe("__bold__")
  })

  test("underscore bold via b tag", () => {
    expect(convert(el("<b>bold</b>"), { strongDelimiter: "__" })).toBe("__bold__")
  })
})

describe("fence option", () => {
  test("tilde fence", () => {
    expect(convert(
      el("<pre><code>code</code></pre>"),
      { fence: "~~~" },
    )).toBe("~~~\ncode\n~~~")
  })

  test("tilde fence with language", () => {
    expect(convert(
      el('<pre><code class="language-ts">let x = 1;</code></pre>'),
      { fence: "~~~" },
    )).toBe("~~~ts\nlet x = 1;\n~~~")
  })
})

describe("URLs preserved as-is", () => {
  test("URL with query params and fragment", () => {
    expect(convert(
      el('<a href="https://example.com/path?query=value&amp;foo=bar#section">link</a>'),
    )).toBe("[link](https://example.com/path?query=value&foo=bar#section)")
  })

  test("URL with parentheses", () => {
    expect(convert(
      el('<a href="https://en.wikipedia.org/wiki/C_(programming_language)">C</a>'),
    )).toBe("[C](https://en.wikipedia.org/wiki/C_(programming_language))")
  })

  test("URL with uppercase preserved", () => {
    expect(convert(
      el('<a href="HTTP://EXAMPLE.COM/Path/To/Resource">link</a>'),
    )).toBe("[link](HTTP://EXAMPLE.COM/Path/To/Resource)")
  })

  test("URL with plus sign preserved", () => {
    expect(convert(
      el('<a href="https://example.com/search?q=foo+bar">link</a>'),
    )).toBe("[link](https://example.com/search?q=foo+bar)")
  })

  test("URL with tilde preserved", () => {
    expect(convert(
      el('<a href="https://example.com/~user/">home</a>'),
    )).toBe("[home](https://example.com/~user/)")
  })

  test("URL with existing percent-encoding preserved", () => {
    expect(convert(
      el('<a href="https://example.com/file%20name%21">link</a>'),
    )).toBe("[link](https://example.com/file%20name%21)")
  })

  test("link title with special chars preserved", () => {
    expect(convert(
      el('<a href="/page" title="Title with (parens) and [brackets]">link</a>'),
    )).toBe('[link](/page "Title with (parens) and [brackets]")')
  })

  test("image src preserved as-is", () => {
    expect(convert(
      el('<img src="https://example.com/images/photo.jpg?w=200&amp;h=100" alt="photo">'),
    )).toBe("![photo](https://example.com/images/photo.jpg?w=200&h=100)")
  })

  test("image src with query and fragment", () => {
    expect(convert(
      el('<img src="/assets/img.png?v=2#footer" alt="img">'),
    )).toBe("![img](/assets/img.png?v=2#footer)")
  })
})

describe("processText", () => {
  test("plain text returned as-is", () => {
    expect(processText("hello world")).toBe("hello world")
  })

  test("whitespace collapsed to single space", () => {
    expect(processText("hello\n\n\nworld")).toBe("hello world")
  })

  test("tab converted to space", () => {
    expect(processText("hello\tworld")).toBe("hello world")
  })

  test("multiple spaces collapsed", () => {
    expect(processText("hello    world")).toBe("hello world")
  })

  test("asterisk escaped", () => {
    expect(processText("3 * 4")).toBe("3 \\* 4")
  })

  test("underscore escaped", () => {
    expect(processText("_hello_")).toBe("\\_hello\\_")
  })

  test("backtick escaped", () => {
    expect(processText("`code`")).toBe("\\`code\\`")
  })

  test("brackets escaped", () => {
    expect(processText("[link]")).toBe("\\[link\\]")
  })

  test("hash escaped", () => {
    expect(processText("# heading")).toBe("\\# heading")
  })

  test("non-ASCII characters not escaped or modified", () => {
    expect(processText("café")).toBe("café")
  })

  test("exclamation escaped", () => {
    expect(processText("Hello!")).toBe("Hello\\!")
  })
})

describe("collapseTrim", () => {
  test("leading newlines removed", () => {
    expect(collapseTrim("\n\n\nhello")).toBe("hello")
  })

  test("trailing newlines removed", () => {
    expect(collapseTrim("hello\n\n\n")).toBe("hello")
  })

  test("3+ newlines collapsed to 2", () => {
    expect(collapseTrim("a\n\n\n\n\nb")).toBe("a\n\nb")
  })

  test("double newlines preserved", () => {
    expect(collapseTrim("a\n\nb")).toBe("a\n\nb")
  })

  test("single newline preserved", () => {
    expect(collapseTrim("a\nb")).toBe("a\nb")
  })

  test("no newlines unchanged", () => {
    expect(collapseTrim("hello world")).toBe("hello world")
  })
})

describe("postProcess", () => {
  test("empty anchor removed", () => {
    expect(postProcess("[​](#section)")).toBe("")
  })

  test("empty anchor with preceding whitespace removed", () => {
    expect(postProcess(" [\u200B](#section)")).toBe("")
  })

  test("escaped hyphen unescaped", () => {
    expect(postProcess("foo\\-bar")).toBe("foo-bar")
  })

  test("multiple escaped hyphens unescaped", () => {
    expect(postProcess("\\- \\- \\-")).toBe("- - -")
  })

  test("normal text unchanged", () => {
    expect(postProcess("hello world")).toBe("hello world")
  })
})
