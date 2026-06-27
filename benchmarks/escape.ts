import { bench } from "benchik"
import { escapeMarkdown, escapeMarkdownWithReplace } from "../src/utils.ts"

using g1 = bench.group("escapeMarkdown: loop vs regex  (0% special chars)")

const plainText = "hello world this is plain text with no special characters".repeat(200)
bench("loop (Set.has)", () => { escapeMarkdown(plainText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(plainText) })

using g2 = bench.group("escapeMarkdown: loop vs regex  (5% special chars)")

const mixedText = "hello_world *foo* [bar] #baz +qux -quux !thing `code` and some plain text here".repeat(50)
bench("loop (Set.has)", () => { escapeMarkdown(mixedText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(mixedText) })

using g3 = bench.group("escapeMarkdown: loop vs regex  (50% special chars)")

const denseText = "\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`".repeat(100)
bench("loop (Set.has)", () => { escapeMarkdown(denseText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(denseText) })
