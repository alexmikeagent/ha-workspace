import { createHighlighterCoreSync } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import markdown from "shiki/langs/markdown.mjs"
import yaml from "shiki/langs/yaml.mjs"
import json from "shiki/langs/json.mjs"
import python from "shiki/langs/python.mjs"
import html from "shiki/langs/html.mjs"
import javascript from "shiki/langs/javascript.mjs"
import typescript from "shiki/langs/typescript.mjs"
import css from "shiki/langs/css.mjs"
import shellscript from "shiki/langs/shellscript.mjs"
import theme from "shiki/themes/github-dark-default.mjs"

export const createSourceHighlighter = () =>
  createHighlighterCoreSync({
    themes: [theme],
    langs: [markdown, yaml, json, python, html, javascript, typescript, css, shellscript],
    engine: createJavaScriptRegexEngine(),
  })
