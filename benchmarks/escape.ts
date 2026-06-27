import { bench } from "benchik"
import { escapeMarkdown, escapeMarkdownWithReplace, escapeMarkdownWithMatchAll } from "../src/utils.ts"

using g1 = bench.group("escapeMarkdown: 3 variants  (0% special chars)")

const plainText = "hello world this is plain text with no special characters".repeat(200)
bench("loop (Set.has)", () => { escapeMarkdown(plainText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(plainText) })
bench("matchAll (manual build)", () => { escapeMarkdownWithMatchAll(plainText) })

using g2 = bench.group("escapeMarkdown: 3 variants  (5% special chars)")

const mixedText = "hello_world *foo* [bar] #baz +qux -quux !thing `code` and some plain text here".repeat(50)
bench("loop (Set.has)", () => { escapeMarkdown(mixedText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(mixedText) })
bench("matchAll (manual build)", () => { escapeMarkdownWithMatchAll(mixedText) })

using g3 = bench.group("escapeMarkdown: 3 variants  (50% special chars)")

const denseText = "\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`".repeat(100)
bench("loop (Set.has)", () => { escapeMarkdown(denseText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(denseText) })
bench("matchAll (manual build)", () => { escapeMarkdownWithMatchAll(denseText) })
