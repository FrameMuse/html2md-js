import { describe, test, expect } from "bun:test";
import { htmlToMd, HOIST_IMAGES, HOIST_LINKS, SkipFlags } from "../src/index.ts";

describe("paragraphs", () => {
  test("simple paragraph", () => {
    expect(htmlToMd("<p>Hello World</p>")).toBe("Hello World");
  });

  test("two paragraphs", () => {
    expect(htmlToMd("<p>First</p><p>Second</p>")).toBe("First\n\nSecond");
  });

  test("empty paragraph", () => {
    expect(htmlToMd("<p></p>")).toBe("");
  });
});

describe("headings", () => {
  test("h1", () => {
    expect(htmlToMd("<h1>Title</h1>")).toBe("# Title");
  });

  test("h2", () => {
    expect(htmlToMd("<h2>Section</h2>")).toBe("## Section");
  });

  test("h3", () => {
    expect(htmlToMd("<h3>Sub</h3>")).toBe("### Sub");
  });
});

describe("bold and italic", () => {
  test("bold via strong", () => {
    expect(htmlToMd("<strong>bold</strong>")).toBe("**bold**");
  });

  test("bold via b", () => {
    expect(htmlToMd("<b>bold</b>")).toBe("**bold**");
  });

  test("italic via i", () => {
    expect(htmlToMd("<i>italic</i>")).toBe("_italic_");
  });

  test("emphasis via em is highlight", () => {
    expect(htmlToMd("<em>highlight</em>")).toBe("==highlight==");
  });
});

describe("links", () => {
  test("basic link", () => {
    expect(htmlToMd('<a href="https://example.com">Example</a>')).toBe(
      "[Example](https://example.com)",
    );
  });

  test("link with title", () => {
    expect(
      htmlToMd('<a href="https://example.com" title="Example Site">Example</a>'),
    ).toBe('[Example](https://example.com "Example Site")');
  });

  test("link without href is plain text", () => {
    expect(htmlToMd("<a>Nothing</a>")).toBe("Nothing");
  });
});

describe("images", () => {
  test("basic image", () => {
    expect(htmlToMd('<img src="image.png" alt="Alt">')).toBe("![Alt](image.png)");
  });

  test("image with title", () => {
    expect(
      htmlToMd('<img src="image.png" alt="Alt" title="Photo">'),
    ).toBe('![Alt](image.png "Photo")');
  });

  test("image without src is skipped", () => {
    expect(htmlToMd('<img alt="Alt">')).toBe("");
  });
});

describe("inline code", () => {
  test("basic code", () => {
    expect(htmlToMd("<code>code</code>")).toBe("`code`");
  });

  test("code with backticks", () => {
    expect(htmlToMd("<code>`code`</code>")).toBe("`` `code` ``");
  });

  test("code with leading backtick", () => {
    expect(htmlToMd("<code>`test</code>")).toBe("`` `test ``");
  });
});

describe("horizontal rule", () => {
  test("hr", () => {
    expect(htmlToMd("<hr>")).toBe("---");
  });
});

describe("unordered lists", () => {
  test("basic ul", () => {
    expect(htmlToMd("<ul><li>One</li><li>Two</li></ul>")).toBe("- One\n- Two");
  });
});

describe("ordered lists", () => {
  test("basic ol", () => {
    expect(htmlToMd("<ol><li>First</li><li>Second</li></ol>")).toBe("1.  First\n2.  Second");
  });
});

describe("blockquotes", () => {
  test("basic blockquote", () => {
    expect(htmlToMd("<blockquote><p>Quote</p></blockquote>")).toBe("> Quote");
  });
});

describe("code blocks", () => {
  test("pre code with language", () => {
    expect(htmlToMd(
      '<pre><code class="language-ts">let x = 1;</code></pre>',
    )).toBe("```ts\nlet x = 1;\n```");
  });

  test("pre code without language", () => {
    expect(htmlToMd("<pre><code>let x = 1;</code></pre>")).toBe("```\nlet x = 1;\n```");
  });

  test("language propagation from pre to code", () => {
    expect(htmlToMd(
      '<pre class="language-js"><code>const a = 1;</code></pre>',
    )).toBe("```js\nconst a = 1;\n```");
  });

  test("pre code with br inside span preserves newlines", () => {
    expect(htmlToMd(
      '<pre><code><span>line1</span><br><span>line2</span></code></pre>',
    )).toBe("```\nline1\nline2\n```");
  });

  test("prism-code with span/br multiline", () => {
    expect(htmlToMd(
      '<pre class="prism-code language-json"><code><span class="token-line"><span class="token punctuation">[</span></span><br><span class="token-line"><span class="token punctuation">]</span></span></code></pre>',
    )).toBe("```json\n[\n]\n```");
  });
});

describe("tables", () => {
  test("simple table", () => {
    expect(htmlToMd(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
    )).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });

  test("infobox table with colspan th and td values", () => {
    expect(htmlToMd(
      `<table>
        <tr><th colspan="2">Stats</th></tr>
        <tr><th>Army</th><td>British</td></tr>
        <tr><th>Health</th><td>395</td></tr>
      </table>`,
    )).toBe("| Stats | |\n| --- | --- |\n| Army | British |\n| Health | 395 |");
  });
});

describe("admonitions", () => {
  test("note admonition", () => {
    expect(htmlToMd(
      '<div class="theme-admonition-note"><div class="admonitionContent"><p>Note content</p></div></div>',
    )).toBe("> [!NOTE]\n> \n> Note content");
  });

  test("warning admonition", () => {
    expect(htmlToMd(
      '<div class="theme-admonition-warning"><div class="admonitionContent"><p>Warning!</p></div></div>',
    )).toBe("> [!WARNING]\n> \n> Warning\\!");
  });
});

describe("code-by feature", () => {
  test("code-by wraps text in backticks, splits around links", () => {
    expect(htmlToMd(
      '<h3 class="property">annotations: ReadonlyArray&lt;<a href="/docs/Annotation/">Annotation</a>&gt;</h3>',
      { codeBy: ["h3.property"] },
    )).toBe("### `annotations: ReadonlyArray<`[Annotation](/docs/Annotation/)`>`");
  });

  test("code-by preserves links inside code split", () => {
    expect(htmlToMd(
      '<h3 class="property"><a href="/docs/api/foo/"><code>foo</code></a>: <a href="/docs/api/Bar/"><code>Bar</code></a></h3>',
      { codeBy: ["h3.property"] },
    )).toBe("### [`foo`](/docs/api/foo/)`: `[`Bar`](/docs/api/Bar/)");
  });

  test("code-by no match when class absent", () => {
    expect(htmlToMd("<h3>plain heading</h3>", { codeBy: ["h3.property"] })).toBe("### plain heading");
  });
});

describe("links-in-code", () => {
  test("link inside code splits code span around link", () => {
    expect(htmlToMd(
      '<p><code>use <a href="/docs/Foo/">Foo</a> from bar</code></p>',
    )).toBe("`use `[Foo](/docs/Foo/)` from bar`");
  });
});

describe("figcaption and address", () => {
  test("figcaption becomes italic", () => {
    expect(htmlToMd("<figcaption>Caption</figcaption>")).toBe("_Caption_");
  });

  test("address becomes bold", () => {
    expect(htmlToMd("<address>Author</address>")).toBe("**Author**");
  });
});

describe("form and fieldset are skipped", () => {
  test("form is skipped", () => {
    expect(htmlToMd("<form>content</form>")).toBe("");
  });

  test("fieldset is skipped", () => {
    expect(htmlToMd("<fieldset>content</fieldset>")).toBe("");
  });
});

describe("interactive elements are skipped", () => {
  test("button is skipped", () => {
    expect(htmlToMd("<button>Click</button>")).toBe("");
  });

  test("input is skipped", () => {
    expect(htmlToMd('<input type="text" value="hello">')).toBe("");
  });

  test("select is skipped", () => {
    expect(htmlToMd("<select><option>A</option></select>")).toBe("");
  });

  test("textarea is skipped", () => {
    expect(htmlToMd("<textarea>text</textarea>")).toBe("");
  });
});

describe("es carp ing", () => {
  test("asterisks escaped", () => {
    expect(htmlToMd("<p>3 * 4 = 12</p>")).toBe("3 \\* 4 = 12");
  });

  test("underscores escaped", () => {
    expect(htmlToMd("<p>_hello_</p>")).toBe("\\_hello\\_");
  });

  test("backticks escaped", () => {
    expect(htmlToMd("<p>`code`</p>")).toBe("\\`code\\`");
  });

  test("inline code is not escaped", () => {
    expect(htmlToMd("<p>inline <code>_code_</code> here</p>")).toBe(
      "inline `_code_` here",
    );
  });

  test("code blocks are not escaped", () => {
    expect(htmlToMd("<pre><code>*bold*</code></pre>")).toBe("```\n*bold*\n```");
  });
});

describe("whitespace", () => {
  test("multiline text collapses", () => {
    expect(htmlToMd("<p>Hello\n\nWorld</p>")).toBe("Hello World");
  });

  test("multiple spaces collapse", () => {
    expect(htmlToMd("<p>Hello    World</p>")).toBe("Hello World");
  });

  test("whitespace preserved in pre", () => {
    expect(htmlToMd("<pre><code>  spaced  </code></pre>")).toBe("```\n  spaced  \n```");
  });
});

describe("post-processing", () => {
  test("hash-link anchors stripped", () => {
    expect(htmlToMd('<a href="#section">​</a>')).toBe("");
  });
});

describe("image hoisting", () => {
  test("hoists single image", () => {
    expect(htmlToMd(
      '<img src="cat.png" alt="Cat">',
      { flags: HOIST_IMAGES },
    )).toBe("![Cat][img0]\n\n[img0]: cat.png\n");
  });

  test("hoists image with title", () => {
    expect(htmlToMd(
      '<img src="cat.png" alt="Cat" title="A cat">',
      { flags: HOIST_IMAGES },
    )).toBe('![Cat][img0]\n\n[img0]: cat.png "A cat"\n');
  });

  test("dedup same url", () => {
    expect(htmlToMd(
      '<p><img src="cat.png" alt="Cat"><img src="cat.png" alt="Same cat"></p>',
      { flags: HOIST_IMAGES },
    )).toBe("![Cat][img0]![Same cat][img0]\n\n[img0]: cat.png\n");
  });

  test("different urls get different refs", () => {
    expect(htmlToMd(
      '<p><img src="a.png" alt="A"><img src="b.png" alt="B"></p>',
      { flags: HOIST_IMAGES },
    )).toBe("![A][img0]![B][img1]\n\n[img0]: a.png\n[img1]: b.png\n");
  });

  test("default flags does not hoist", () => {
    expect(htmlToMd('<img src="cat.png" alt="Cat">')).toBe("![Cat](cat.png)");
  });
});

describe("link hoisting", () => {
  test("hoists single link", () => {
    expect(htmlToMd(
      '<a href="https://x.com">X</a>',
      { flags: HOIST_LINKS },
    )).toBe("[X][ref0]\n\n[ref0]: https://x.com\n");
  });

  test("dedup same url", () => {
    expect(htmlToMd(
      '<p><a href="https://x.com">X</a> <a href="https://x.com">Y</a></p>',
      { flags: HOIST_LINKS },
    )).toBe("[X][ref0] [Y][ref0]\n\n[ref0]: https://x.com\n");
  });

  test("link with title different from content", () => {
    expect(htmlToMd(
      '<a href="https://x.com" title="The X">X</a>',
      { flags: HOIST_LINKS },
    )).toBe('[X][ref0]\n\n[ref0]: https://x.com "The X"\n');
  });

  test("link with title matching content", () => {
    expect(htmlToMd(
      '<a href="/wiki/British" title="British">British</a>',
      { flags: HOIST_LINKS },
    )).toBe("[British][ref0]\n\n[ref0]: /wiki/British\n");
  });

  test("HOIST_IMAGES | HOIST_LINKS both work", () => {
    expect(htmlToMd(
      '<p><a href="https://x.com"><img src="cat.png" alt="Cat"></a></p>',
      { flags: HOIST_IMAGES | HOIST_LINKS },
    )).toBe("[![Cat][img0]][ref1]\n\n[img0]: cat.png\n[ref1]: https://x.com\n");
  });
});

describe("skip flags", () => {
  test("block-level aria-hidden skipped", () => {
    expect(htmlToMd(
      '<p>Visible</p><div aria-hidden="true"><p>Hidden</p></div>',
      { skip: SkipFlags.ARIA_HIDDEN },
    )).toBe("Visible");
  });

  test("inline-level aria-hidden skipped (e.g. svg icon inside link)", () => {
    expect(htmlToMd(
      '<p>text <a href="/edit"><svg aria-hidden="true"><use href="#icon"></use></svg>Edit</a></p>',
      { skip: SkipFlags.ARIA_HIDDEN },
    )).toBe("text [Edit](/edit)");
  });

  test("inline aria-hidden alone produces empty anchor (no content)", () => {
    expect(htmlToMd(
      '<p>text <a href="/edit"><svg aria-hidden="true"><use href="#icon"></use></svg></a></p>',
      { skip: SkipFlags.ARIA_HIDDEN },
    )).toBe("text ");
  });

  test("aria-hidden inside table cell skipped", () => {
    expect(htmlToMd(
      '<table><tr><td>Keep <svg aria-hidden="true"><use href="#x"></use></svg> this</td></tr></table>',
      { skip: SkipFlags.ARIA_HIDDEN },
    )).toBe("| Keep  this |\n| --- |");
  });

  test("aria-hidden elements preserved without skip flag", () => {
    expect(htmlToMd(
      '<div aria-hidden="true"><p>Hidden</p></div>',
    )).toBe("Hidden");
  });

  test("header skipped with SkipFlags.HEADER", () => {
    expect(htmlToMd("<header>Brand</header><p>Body</p>", { skip: SkipFlags.HEADER })).toBe("Body");
  });

  test("footer skipped with SkipFlags.FOOTER", () => {
    expect(htmlToMd("<p>Body</p><footer>Copyright</footer>", { skip: SkipFlags.FOOTER })).toBe("Body");
  });

  test("aside skipped with SkipFlags.ASIDE", () => {
    expect(htmlToMd("<aside>Sidebar</aside><p>Main</p>", { skip: SkipFlags.ASIDE })).toBe("Main");
  });

  test("nav skipped with SkipFlags.NAV", () => {
    expect(htmlToMd("<nav>Links</nav><p>Content</p>", { skip: SkipFlags.NAV })).toBe("Content");
  });

  test("menu skipped with SkipFlags.MENU", () => {
    expect(htmlToMd("<menu><li>Item</li></menu><p>Body</p>", { skip: SkipFlags.MENU })).toBe("Body");
  });

  test("tags preserved without skip flag", () => {
    expect(htmlToMd("<header>Brand</header><p>Body</p>")).toBe("Brand\n\nBody");
  });

  test("multiple skip flags combined", () => {
    expect(htmlToMd(
      "<header>H</header><nav>N</nav><p>Body</p><footer>F</footer>",
      { skip: SkipFlags.HEADER | SkipFlags.FOOTER | SkipFlags.NAV },
    )).toBe("Body");
  });
});
