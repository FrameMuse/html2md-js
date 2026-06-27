# html-to-md conversion spec

Converter walks linkedom DOM tree and produces markdown.
Maps HTML elements to markdown syntax as described below.

## Options

| Option | Default | Notes |
|---|---|---|
| headingStyle | `atx` | `# ` prefix |
| codeBlockStyle | `fenced` | ` ``` ` |
| bulletListMarker | `-` | |
| hr | `---` | |
| emDelimiter | `_` | |
| strongDelimiter | `**` | |
| fence | ` ``` ` | |
| flags | `0` | bitmask, `HOIST_IMAGES = 1` hoists `![](url)` → `![](ref)` + footer refs |

## Block elements

| HTML | Markdown | Notes |
|---|---|---|
| `h1`..`h6` | `# Title`, `## Title`, etc. | ATX style |
| `p` | `text` | wrapped in `\n\n` |
| `blockquote` | `> text` | `>` per line, recursive |
| `ul` | `- item` | `- ` prefix, nested indent |
| `ol` | `1. item` | numbered, respects `start` attr |
| `pre>code` | ` ```lang ` fence | language from `class="language-*"` |
| `pre` alone | ` ``` ` fence | fenced even without `<code>` |
| `hr` | `---` | |
| `table` | GFM pipe table | column-width padded |
| `div`, `section`, `article`, `main`, `aside`, `header`, `footer`, `nav` | pass-through | if children contain block elements, process as document; otherwise wrap as paragraph |
| `figure` | pass-through | same container logic as `div` |
| `figcaption` | `_text_` | italic |
| `address` | `**text**` | bold |
| `form`, `fieldset` | (skip) | removed from output |
| `button`, `input`, `select`, `textarea`, `option` | (skip) | interactive elements |
| `script`, `style`, `noscript`, `template` | (skip) | removed from output |

## Inline elements

| HTML | Markdown | Notes |
|---|---|---|
| `strong`, `b` | `**text**` | |
| `i` | `_text_` | underscore delimiter |
| `em` | `==text==` | highlight |
| `code` | `` `code` `` | double backticks if content contains `` ` `` |
| `a` | `[text](url "title")` | inline style; title optional |
| `img` | `![alt](src "title")` | |
| `br` | `  \n` | two trailing spaces |
| `span`, `small`, `mark`, `abbr`, `cite`, `q`, `sub`, `sup`, `time` | pass-through | inner content extracted |

## Custom features

### Admonition

Docusaurus admonition divs become GFM alert blockquotes.

| CSS class | Alert type |
|---|---|
| `theme-admonition-note`, `theme-admonition-info` | `[!NOTE]` |
| `theme-admonition-tip` | `[!TIP]` |
| `theme-admonition-important` | `[!IMPORTANT]` |
| `theme-admonition-warning` | `[!WARNING]` |
| `theme-admonition-danger`, `theme-admonition-caution` | `[!CAUTION]` |

```
<div class="theme-admonition-warning">
  <div class="admonitionContent">
    <p>Check permissions</p>
  </div>
</div>
```

becomes

```markdown
> [!WARNING]
> Check permissions
```

### Code-by

CSS selectors (e.g., `h3.property`) mark elements whose text should be
wrapped in inline code, splitting around `<a>` links.

```html
<h3 class="property">type: <a href="/docs/Foo/">Foo</a></h3>
```

becomes

```markdown
### `type: `[Foo](Foo.md)`
```

### Links-in-code

When an `<a>` tag appears inside a `<code>` element, the code span
splits around the link. The link renders as markdown with backticked
link text.

```html
<code>use <a href="/docs/Foo/">Foo</a> from 'bar'</code>
```

becomes

```markdown
`use `[`Foo`](Foo.md)` from 'bar'`
```

Both code formatting and link are preserved. The same logic applies
inside code-by matched elements.

### Language propagation

`<pre class="language-ts">` propagates the language class to child
`<code>` if the code element does not already have one.

## Markdown escaping

Characters escaped in text (outside code blocks/inline code):

`\` `*` `_` `[` `]` `#` `+` `-` `!` `` ` ``

## Whitespace

Runs of whitespace characters collapse to a single space.
Whitespace inside `<pre>` elements is preserved as-is.

## Post-processing

Applied after conversion:

1. Strip Docusaurus hash-link anchors: `\s*\[​\]\(#[^)]+\)`
2. Fix unnecessary hyphen escaping: `\-` to `-`
