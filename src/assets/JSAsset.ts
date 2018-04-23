import Asset from "../Asset";
import { Options } from "../structs/index";
import * as babylon from 'babylon'
import Bundler from "../Bundler";
import * as rollup from 'rollup'
import HTMLAsset from "./HTMLAsset";
import * as babel from 'babel-core'
import { traverse, types as t } from 'babel-core'
import { getNodeString, parse } from 'ody-transpiler/libs/noder'
import { SourceMapGenerator } from 'source-map'
import { ElementNode, RootNode } from "ody-html-tree/index";
import * as uglifyJS from 'uglify-js'

const IMPORT_RE = /\b(?:import\b|export\b|require\s*\()/;
const GLOBAL_RE = /\b(?:process|__dirname|__filename|global|Buffer)\b/;
const FS_RE = /\breadFileSync\b/;
const MODULES_RE = /^[\w-]+(?=$|\/)/
const URI_RE = /__uri\(\s*['`"](.*?)['`"]\s*\)/g

const IMG_RE = /\.(png|jpe?g|gif|webp|bmp)$/

async function getTemplateSerial(asset: HTMLAsset, segment?: string) {
  var collectRes = {
    styles: [],
    scripts: []
  }
  var root: RootNode | undefined
  var ast = await asset.processWithData({}, collectRes)
  await asset.processResources(ast)
  if (segment) {
    let node = ast.getElementById(segment.substring(1))
    if (node) {
      root = new RootNode()
      root.appendChild(node)
    }
  } else {
    root = ast
  }
  var dataName = '__data__'
  asset.transformToType(root, 'js', dataName)
  var ret = asset.render(root)
  return wrapTemplateWithFunction(ret, dataName)
}
function wrapTemplateWithFunction(str: string, dataName = '__data__') {
  return `function f(${dataName}){${str} return __html}`
}
export default class JSAsset extends Asset {
  contents: string
  imgType = 'js'
  extraAssets: {
    [name: string]: (Asset | [Asset, string])[]
  } = {}
  depAst?: RootNode
  init() {
    super.init()
    this.type = 'js'
    this.outDir = 'scripts'
  }
  mightHaveDependencies() {
    /* return (
      !/.js$/.test(this.name) ||
      IMPORT_RE.test(<string>this.contents) ||
      GLOBAL_RE.test(<string>this.contents)
    ); */
    return false
  }
  async transform() {
    var rollupPlugin = {
      name: 'asset-plugin',
      load: async (id: string) => {
        var asset: Asset
        if (id === this.name) {
          asset = this
        } else {
          let dep: any = {}
          let path = id
          let i = id.indexOf('#')
          if (i > -1) {
            path = id.substring(0, i)
          }
          if (IMG_RE.test(path)) {
            dep.dynamic = true
          } else {
            dep.included = true
          }
          asset = this.resovleAssetWithExt(path, dep)
          asset.skipTransform = !asset.isSingleFile
          await asset.process()
        }
        return asset.name
      },
      resolveId: (id: string, parent?: string) => {
        if (!parent) {
          return id
        }
        if (/^[\w-]+(?=$|\/)/.test(id)) {
          if (id.includes('/')) {
            if (!/\.\w+$/.test(id)) {
              id += '.js'
            }
          }
          id = '~/' + id
        } else {
          if (!/\.\w+$/.test(id)) {
            id += '.js'
          }
        }
        let ret = this.resolve(id, parent)
        if (ret) {
          return ret.path + (ret.segment ? '#' + ret.segment : '')
        }
      },
      transform: async (source: string, id: string) => {
        var arr = id.split('#')
        var path = arr[0]
        var segment = arr[1]
        var asset = id === this.name ? this : this.depAssets.get(path)
        var map = new SourceMapGenerator({
          file: path
        })
        if (id === this.name) {
          let names = new Set<string>()
          let exportNameds: [string, string][]
          let imports = ''
          Object.keys(this.extraAssets).forEach(path => {
            this.extraAssets[path].forEach(asset => {
              if (Array.isArray(asset)) {
                imports += `import ${asset[1]} from '${asset[0].name.replace(/\\/g, '/')}';`
              } else {
                names.add(asset.name)
              }
            })
          })
          imports += [...names].map(name => `import "${name.replace(/\\/g, '/')}";`).join('')
          source = <string>asset.contents
          map.addMapping({
            source: id,
            generated: {
              line: 1,
              column: imports.length
            },
            original: {
              line: 1,
              column: 0
            }
          })
          source = imports + source
        } else if (IMG_RE.test(path)) {
          let __url = await asset.getGeneratedUrl(this.imgType)
          source = `export default ${__url}` + (segment ? `+'#${segment}'` : '')
        } else if (path.endsWith('html')) {
          let func = await getTemplateSerial(<HTMLAsset>asset, segment)
          source = 'export default ' + func
        } else {
          source = <string>asset.contents
        }
        return {
          code: source,
          map: map.toString()
        }
      }
    }
    // @ts-ignore
    var bundle = await rollup.rollup({
      input: this.name,
      plugins: [rollupPlugin],
      experimentalDynamicImport: true,
      experimentalCodeSplitting: true,
      external: ['jquery']
    })
    var { code, map } = await bundle.generate({
      format: 'iife',
      sourcemap: this.options.map ? 'inline' : false,
      globals: this.options.script.globals,
      banner: this.options.minify ? '' : this.getBanner()
    })
    var ast = parse(code, {
      sourceType: 'module',
      sourceFilename: this.name
    })
    if (ast) {
      var promises: Promise<any>[] = []
      babel.traverse(ast, {
        CallExpression: path => {
          var node = path.node
          if (t.isIdentifier(node.callee)) {
            let name = node.callee.name
            let args = node.arguments.map(getNodeString)
            if (name === '__regex') {
              let v = this.processRegex(args)
              if (v) {
                path.replaceWithSourceString(v)
              }
            } else if (name === '__template') {
              promises.push(this.processTemplate(args).then(v => {
                if (v) {
                  path.replaceWithSourceString(v)
                }
              }))
            } else if (name === '__api') {
              promises.push(this.processApi(args).then(v => {
                if (v) {
                  path.replaceWithSourceString(v)
                }
              }))
            }
          }
        }
      })
      await Promise.all(promises)
      let result = babel.transformFromAst(ast, undefined, {
        filename: this.name,
        inputSourceMap: map
      })
      code = result.code
      map = result.map
    }
    if (this.options.minify) {
      let ret = this.minify(code, map)
      code = ret.code
      map = ret.map
    }
    if (this.options.map && map) {
      code += `\n//# sourceMappingURL=${map}`
    }
    this.contents = code
  }
  getBanner() {
    var vars = {}
    var defs = this.options.script.global_defs
    return Object.keys(defs).map(key => {
      var ret = ''
      if (key.includes('.')) {
        let items = key.split('.')
        key = items[0]
        if (!vars[key]) {
          ret += `var ${key}={};`
          vars[key] = true
        }
        items.slice(1, -1).forEach((key, i) => {
          let r = items.slice(0, i + 2).join('.')
          ret += `if(${r} === undefined){${r} = {}}`
        })
        ret += `${key}=${JSON.stringify(defs[key])}`
      } else {
        ret = `var ${key}=${JSON.stringify(defs[key])}`
        vars[key] = true
      }
      return ret
    }).join(';') + ';'
  }
  minify(code: string, map?: any) {
    let uglifyOptions = Object.assign({}, this.options.script.uglifyOptions)
    if (this.options.map) {
      uglifyOptions.sourceMap = {
        content: map
      }
    }
    uglifyOptions.compress.global_defs = this.options.script.global_defs
    let result = uglifyJS.minify(code, uglifyOptions)
    // @ts-ignore
    if (result.error) {
      // @ts-ignore
      throw result.error
    }
    return {
      map: result.map,
      code: result.code
    }
  }
  processRegex([name, g]: string[]) {
    if (name) {
      name = name.slice(1, -1)
      if (name in this.options.regexs) {
        return this.options.regexs[name].toString() + (g ? g.slice(1, -1) : '')
      }
    }
  }
  async processTemplate([url, data]: string[]) {
    let asset: HTMLAsset | undefined
    let func: string | undefined
    url = url.slice(1, -1)
    if (url.startsWith('<')) {
      let path = this.getInlineContentName('html', url)
      asset = <HTMLAsset>this.resolveInlineAsset(path, HTMLAsset, url)
      await asset.process()
      func = await getTemplateSerial(asset)
    } else if (url.startsWith('#') && this.depAst) {
      let node = this.depAst.getElementById(url.substring(1))
      if (node) {
        let root = new RootNode()
        root.appendChild(node.clone())
        let dataName = '__data__'
        HTMLAsset.prototype.transformToType.call(this, root, 'js', dataName)
        func = wrapTemplateWithFunction(HTMLAsset.prototype.render.call(this, root), dataName)
      }
    }
    if (func) {
      return `(${func})(${data})`
    }
  }
  async processApi([str]: string[]) {
    if (str) {
      return `'${this.options.script.getApiUrl(str.slice(1, -1))}'`
    }
  }
}