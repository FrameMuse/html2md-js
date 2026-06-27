import { bench } from "benchik"
import { escapeMarkdown, escapeMarkdownWithReplace, escapeMarkdownFastRegex, escapeMarkdownWithMatchAll, escapeMarkdownWithExec, escapeMarkdownSuperFast, escapeMarkdownGodMode, escapeMarkdownHybrid } from "../src/utils.ts"

using g1 = bench.group("escapeMarkdown: 8 variants  (0% special chars)")

const plainText = "hello world this is plain text with no special characters".repeat(200)
bench("loop (Set.has)", () => { escapeMarkdown(plainText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(plainText) })
bench("fastRegex (pre-compiled)", () => { escapeMarkdownFastRegex(plainText) })
bench("matchAll (for..of)", () => { escapeMarkdownWithMatchAll(plainText) })
bench("exec (while loop)", () => { escapeMarkdownWithExec(plainText) })
bench("superFast (Uint8Array+slice)", () => { escapeMarkdownSuperFast(plainText) })
bench("godMode (TextEncoder+buffer)", () => { escapeMarkdownGodMode(plainText) })
bench("hybrid (fast-path+encoder)", () => { escapeMarkdownHybrid(plainText) })

using g2 = bench.group("escapeMarkdown: 8 variants  (5% special chars)")

const mixedText = "hello_world *foo* [bar] #baz +qux -quux !thing `code` and some plain text here".repeat(50)
bench("loop (Set.has)", () => { escapeMarkdown(mixedText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(mixedText) })
bench("fastRegex (pre-compiled)", () => { escapeMarkdownFastRegex(mixedText) })
bench("matchAll (for..of)", () => { escapeMarkdownWithMatchAll(mixedText) })
bench("exec (while loop)", () => { escapeMarkdownWithExec(mixedText) })
bench("superFast (Uint8Array+slice)", () => { escapeMarkdownSuperFast(mixedText) })
bench("godMode (TextEncoder+buffer)", () => { escapeMarkdownGodMode(mixedText) })
bench("hybrid (fast-path+encoder)", () => { escapeMarkdownHybrid(mixedText) })

using g3 = bench.group("escapeMarkdown: 8 variants  (50% special chars)")

const denseText = "\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`\\*_[]#+-!`".repeat(100)
bench("loop (Set.has)", () => { escapeMarkdown(denseText) })
bench("regex (.replace)", () => { escapeMarkdownWithReplace(denseText) })
bench("fastRegex (pre-compiled)", () => { escapeMarkdownFastRegex(denseText) })
bench("matchAll (for..of)", () => { escapeMarkdownWithMatchAll(denseText) })
bench("exec (while loop)", () => { escapeMarkdownWithExec(denseText) })
bench("superFast (Uint8Array+slice)", () => { escapeMarkdownSuperFast(denseText) })
bench("godMode (TextEncoder+buffer)", () => { escapeMarkdownGodMode(denseText) })
bench("hybrid (fast-path+encoder)", () => { escapeMarkdownHybrid(denseText) })
