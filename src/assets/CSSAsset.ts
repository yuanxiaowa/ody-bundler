import Asset from "../Asset";
import { Options } from "../structs/index";
import * as postcss from 'postcss'
import * as Path from 'path'
// @ts-ignore
import * as AtImport from 'postcss-import'
// @ts-ignore
import * as valueParser from 'postcss-value-parser'
import Bundler from "../Bundler";
import ImageAsset from "./ImageAsset";
import * as autoprefixer from 'autoprefixer'

const URL_RE = /url\s*\(\"?(?![a-z]+:)/;
const IMPORT_RE = /@import/;
const PROTOCOL_RE = /^[a-z]+:/;
type valueNode = {
  type: string
  value: string,
  nodes: any[]
};

export default class CSSAsset extends Asset {
  extraAssets: {
    [name: string]: Set<CSSAsset>
  } = {}
  ast: postcss.Root
  init() {
    super.init()
    this.type = 'css'
    this.outDir = 'styles'
  }
  mightHaveDependencies() {
    return (
      !this.name.endsWith('.css')
      || IMPORT_RE.test(<string>this.contents)
      || URL_RE.test(<string>this.contents)
    )
  }
  async transform() {
    var content = <string>this.contents
    var extraAssets = new Set<CSSAsset>()
    Object.keys(this.extraAssets).forEach(key => {
      this.extraAssets[key].forEach(asset => {
        extraAssets.add(asset)
      })
    })
    extraAssets.forEach(item => {
      content = `@import "${item.name.replace(/\\/g, '/')}";` + content
    })

    var result = await postcss([AtImport({
      load: async (filename: string) => {
        var asset = this.resolveAsset(filename, {
          dynamic: true,
          included: true
        }, CSSAsset)
        await asset.loadIfNeeded()
        var content = <string>asset.originalCode
        return content.replace(/(@import\s+["'])(.*?)(?=["'])/g, (_, prefix, url) => {
          var ret = this.resolve(url, filename)
          if (!ret) {
            return prefix + url
          }
          return prefix + ret.path.replace(/\\/g, '/')
        })
      }
    })]).process(content, {
      from: this.name,
      map: this.options.map ? {
        inline: true
      } : undefined
    })
    if (result.root) {
      let promises: Promise<any>[] = []
      result.root.walkDecls(decl => {
        if (URL_RE.test(decl.value)) {
          let parsed = valueParser(decl.value);
          let _promises: Promise<any>[] = []
          parsed.walk((node: valueNode) => {
            if (
              node.type === 'function' &&
              node.value === 'url' &&
              node.nodes.length > 0
            ) {
              let ret = this.resolve(node.nodes[0].value, decl.source.input.from)
              if (ret && ret.path) {
                let asset = this.resolveAsset(ret.path, {
                  dynamic: true,
                  loc: decl.source.start
                }, ImageAsset)
                _promises.push(asset.process().then(() => {
                  node.nodes[0].value = asset.generatedUrl
                }))
              }
            }
          })
          if (_promises.length > 0) {
            promises.push(Promise.all(_promises).then(() => {
              decl.value = parsed.toString()
            }))
          }
        }
      })
      await Promise.all(promises)
      let plugins = [...this.options.style.plugins, autoprefixer({
        browsers: this.options.style.autoprefixer
      })]
      if (this.options.minify) {
        // @ts-ignore
        let cssnano = await import('cssnano')
        plugins.push(cssnano)
      }
      let { css } = await postcss(plugins).process(result.root, {
        from: this.name,
        map: this.options.map ? {
          inline: true
        } : undefined
      })
      this.contents = css
    }
  }
}