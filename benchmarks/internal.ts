import { bench } from "benchik"
import { collapseWhitespace, collapseTrim } from "../src/utils.ts"

using g1 = bench.group("collapseWhitespace / collapseTrim")

const wsText = "  hello   world\n\n\nfoo   bar  ".repeat(500)
bench("collapseWhitespace", () => { collapseWhitespace(wsText) })
bench("collapseTrim", () => { collapseTrim(wsText) })
