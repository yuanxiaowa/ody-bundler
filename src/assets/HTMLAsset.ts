import Asset from "../Asset";
import { parse, render, renderMini, traverseElementNodes, getElementByTagName } from 'ody-html-tree/util'
import { RootNode, ElementNode, Node } from "ody-html-tree/index";
import { Options, Dep, CollectedSlots, CollectRes } from "../structs/index";
import Bundler from "../Bundler";
import JSAsset from "./JSAsset";
import md5 from "../utils/md5";
import { renderData } from 'render-static'
import JSInlineAsset from "./JSInlineAsset";
import CSSInlineAsset from "./CSSInlineAsset";
import * as Path from 'path'
import ComponentAsset from "./ComponentAsset";
import CSSAsset from "./CSSAsset";
import ImageAsset from "./ImageAsset";
import { getTranspiler } from "ody-transpiler/util";

function getDevUrl(url: string) {
  return new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest()
    xhr.open('get', url)
    xhr.onload = () => resolve(xhr.response)
    xhr.onerror = reject
    xhr.send()
  })
}

const devContainer = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><style>html,body{height:100%;margin:0}iframe{width:100%;height:100%;border:0}</style><iframe id="ifr"></iframe><script></script></body></html>'
function renderHtml(html: string) {
  var iframe = <HTMLIFrameElement>document.getElementById('ifr')
  iframe.contentDocument.write(html)
}


const ATTRS = {
  src: [
    'script',
    'img',
    'audio',
    'video',
    'source',
    'track',
    'iframe',
    'embed'
  ],
  href: ['link', 'a'],
  poster: ['video']
}

export default class HTMLAsset extends Asset {
  ast: RootNode
  originalCode: string
  mainJSAsset: JSAsset
  mainJSHandler: (assets: (JSAsset | [JSAsset, string])[]) => Promise<any>
  mainCSSAsset: CSSAsset
  mainCSSHandler: (assets: CSSAsset[]) => Promise<any>
  init() {
    super.init()
    this.type = 'html'
  }
  parse(content: string) {
    return parse(content, this.name)
  }
  // 处理资源
  processResources(root: RootNode) {
    var promises: Promise<any>[] = []
    this.traverseNodes(root.children, root, promises)
    return Promise.all(promises)
  }
  traverseNodes(nodes: ElementNode[], ast: RootNode, promises: Promise<any>[]) {
    nodes.forEach(node => {
      this.traverseElementNode(node, ast, promises)
    })
  }
  resolveNodePath(node: ElementNode, name: string) {
    return this.resolve(name, node.source.filename)
  }
  traverseElementNode(node: ElementNode, ast: RootNode, promises: Promise<any>[]): Promise<any> | undefined {
    var tag = node.name
    if (tag === 'img') {
      let ret = this.resolveNodePath(node, node.getAttribute('src'))
      if (ret && ret.path) {
        let dep: any = {
          dynamic: true
        }
        if (node.hasAttribute('__inline') && this.options.env === 'production') {
          dep.included = true
        }
        let assetDep = this.resolveAsset(ret.path, dep, ImageAsset)
        assetDep.isSingleFile = assetDep.isSingleFile || !dep.included
        if (dep.included) {
          promises.push(assetDep.process().then(() => {
            // @ts-ignore
            node.setAttribute('src', assetDep.toString())
            node.removeAttribute('__inline')
          }))
        } else if (node.hasAttribute('__async')) {
          let loadingIconPath = node.getAttribute('__async')
          node.removeAttribute('__async')
          if (!loadingIconPath) {
            loadingIconPath = this.options.loadingIcon
          }
          let p = this.resolve(loadingIconPath)
          if (!p || !p.path) {
            if (p) {
              node.setAttribute('src', p.segment)
            } else {
              node.setAttribute('src', loadingIconPath)
            }
            promises.push((async () => {
              await assetDep.process()
              node.setAttribute('data-src', await assetDep.getGeneratedUrl())
            })())
          } else {
            let assetIcon = this.resolveAsset(p.path, {
              dynamic: true
            }, ImageAsset)
            promises.push((async () => {
              await Promise.all([assetDep.process(), assetIcon.process()])
              let [src1, src2] = await Promise.all([assetIcon.getGeneratedUrl(), assetDep.getGeneratedUrl()])
              node.setAttribute('src', src1 + (p.segment ? '#' + p.segment : ''))
              node.setAttribute('data-src', src2)
            })())
          }
        } else {
          promises.push((async () => {
            await assetDep.process()
            let src = await assetDep.getGeneratedUrl()
            node.setAttribute('src', src + (ret.segment ? '#' + ret.segment : ''))
          })())
        }
      }
      if (node.hasAttribute('srcset')) {
        let srcset: string = node.getAttribute('srcset')
        if (srcset) {
          let ps: Promise<[string, string]>[] = []
          srcset.split(',')
            .map(item => item.trim().split(/\s+/))
            .forEach(([url, x]) => {
              let ret = this.resolveNodePath(node, url)
              if (ret && ret.path) {
                let assetDep = this.resolveAsset(ret.path, {
                  dynamic: true
                }, ImageAsset)
                assetDep.isSingleFile = true
                ps.push((async () => {
                  await assetDep.process()
                  return <[string, string]>[await assetDep.getGeneratedUrl(), x]
                })())
              }
            })
          promises.push(Promise.all(ps)
            .then(items => {
              var srcset = items.map(item => item.join(' ')).join(',')
              node.setAttribute('srcset', srcset)
            }))
        }
      }
      return
    } else if (tag === 'use') {
      let ret = this.resolveNodePath(node, node.getAttribute('xlink:href'))
      if (ret && ret.path) {
        let assetDep = this.resolveAsset(ret.path, {
          dynamic: true
        }, ImageAsset)
        promises.push((async () => {
          await assetDep.process()
          let src = await assetDep.getGeneratedUrl()
          // @ts-ignore
          node.setAttribute('xlink:href', src + (ret.segment ? '#' + reg.segment : ''))
        })())
      }
      return
    } else if (tag === 'script') {
      if (!node.hasAttribute('type') || node.getAttribute('type') === 'text/javascript') {
        if (node.hasAttribute('src')) {
          let ret = this.resolveNodePath(node, node.getAttribute('src'))
          if (ret && ret.path) {
            let isMain = node.hasAttribute('__main')
            let dep: any = {
              dynamic: true
            }
            if (node.hasAttribute('__inline') && this.options.minify) {
              dep.included = true
            }
            let assetDep = <JSAsset>this.resolveAsset(ret.path, dep, JSAsset)
            assetDep.isSingleFile = assetDep.isSingleFile || !dep.included
            let handle = async () => {
              await assetDep.process()
              if (dep.included) {
                node.removeAttribute('__inline')
                node.removeAttribute('src')
                // @ts-ignore
                node.text(assetDep.contents)
              } else {
                node.setAttribute('src', await assetDep.getGeneratedUrl())
              }
            }
            if (isMain) {
              this.mainJSAsset = assetDep
              assetDep.depAst = ast
              this.mainJSHandler = (assets) => {
                assetDep.extraAssets[this.name] = assets
                return handle()
              }
              node.removeAttribute('__main')
            } else {
              promises.push(handle())
            }
          }
        } else {
          let path = this.getInlineContentName('.js', node.textContent, node.source.filename)
          let assetDep = <JSInlineAsset>this.resolveInlineAsset(path, JSInlineAsset, node.textContent)
          if (node.hasAttribute('__vars')) {
            node.removeAttribute('__vars')
            assetDep.onlyVars = true
          }
          assetDep.depAst = ast
          promises.push(assetDep.process().then(() => {
            // @ts-ignore
            node.text(assetDep.contents)
          }))
        }
        return
      }
    } else if (tag === 'link') {
      if (node.hasAttribute('href')) {
        let ret = this.resolveNodePath(node, node.getAttribute('href'))
        if (ret) {
          let dep: any = {
            dynamic: true
          }
          if (node.hasAttribute('__inline') && this.options.minify) {
            dep.included = true
          }
          let rel: string = node.getAttribute('rel')
          if (rel) {
            if (rel === 'stylesheet') {
              let isMain = node.hasAttribute('__main')
              let assetDep = <CSSAsset>this.resolveAsset(ret.path, dep, CSSAsset)
              assetDep.isSingleFile = assetDep.isSingleFile || !dep.included
              let handle = async () => {
                await assetDep.process()
                if (dep.included) {
                  node.removeAttribute('__inline')
                  node.removeAttribute('href')
                  node.removeAttribute('rel')
                  node.name = 'style'
                  // @ts-ignore
                  node.text(assetDep.contents)
                } else {
                  node.setAttribute('href', await assetDep.getGeneratedUrl())
                }
              }
              if (isMain) {
                this.mainCSSAsset = assetDep
                this.mainCSSHandler = assets => {
                  assetDep.extraAssets[this.name] = new Set(assets)
                  return handle()
                }
                node.removeAttribute('__main')
              } else {
                promises.push(handle())
              }
            } else if (rel.includes('icon')) {
              let assetDep = this.resolveAsset(ret.path, dep, ImageAsset)
              assetDep.isSingleFile = true
              promises.push((async () => {
                await assetDep.process()
                node.setAttribute('href', await assetDep.getGeneratedUrl())
              })())
            }
          }
        }
      }
      return
    } else if (tag === 'style') {
      let path = this.getInlineContentName('.css', node.textContent, node.source.filename)
      let assetDep = this.resolveInlineAsset(path, CSSInlineAsset, node.textContent)
      promises.push(assetDep.process().then(() => {
        // @ts-ignore
        node.text(assetDep.contents)
      }))
      return
    } else {
      if (node.hasAttribute('style')) {
        let text = node.getAttribute('style')
        if (text) {
          let path = this.getInlineContentName('.css', text, node.source.filename)
          let assetDep = this.resolveInlineAsset(path, CSSInlineAsset, '.a{' + text + '}')
          promises.push(assetDep.process().then(() => {
            let css = <string>assetDep.contents
            // @ts-ignore
            node.setAttribute('style', /\.a\{([\w\W]*)\}/.exec(css)[1])
          }))
        }
      }
      if ((tag === 'video' || tag === 'audio' || tag === 'source' || tag === 'embed') && node.hasAttribute('src')) {
        let ret = this.resolveNodePath(node, node.getAttribute('src'))
        let assetDep = this.resovleAssetWithExt(ret.path)
        assetDep.isSingleFile = true
        promises.push((async () => {
          await assetDep.process()
          node.setAttribute('src', await assetDep.getGeneratedUrl())
        })())
      }
      if (tag === 'video' && node.hasAttribute('poster')) {
        let path = node.getAttribute('poster')
        if (path) {
          let assetDep = this.resolveAsset(path, { dynamic: true }, ImageAsset)
          assetDep.isSingleFile = true
          promises.push((async () => {
            await assetDep.process()
            node.setAttribute('poster', await assetDep.getGeneratedUrl())
          })())
        }
      }
      if (node.childNodes.length > 0) {
        this.traverseNodes(node.children, ast, promises)
      }
    }
  }
  async handleCI(root: RootNode, data: any, collectRes: CollectRes, collectedSlots: CollectedSlots = {}) {
    let promises: Promise<any>[] = []
    let mm: {
      [name: string]: ((nodes: Node[]) => Promise<any>)[]
    } = {}
    this.handleCITraverse(root.children, collectRes, mm, promises)
    Object.keys(mm).forEach(name => {
      let handlers = mm[name]
      let items: Node[][] = Array(handlers.length)
      let nodes = collectedSlots[name]
      if (nodes) {
        items[0] = nodes
        for (let i = 1; i < handlers.length; i++) {
          items[i] = nodes.map(node => node.clone())
        }
      }
      handlers.forEach((handler, i) => {
        promises.push(handler(items[i]))
      })
    })
    return Promise.all(promises)
  }
  handleCITraverse(nodes: ElementNode[], collectRes: CollectRes, mm: {
    [name: string]: ((nodes: Node[]) => Promise<any>)[]
  }, promises: Promise<any>[]) {
    nodes.forEach(node => {
      var tag = node.name
      if (tag === 'slot') {
        node.name = 'template'
        let name: string
        if (node.hasAttribute('name')) {
          name = node.getAttribute('name')
        } else {
          name = 'defaults'
        }
        let handler = async (nodes?: Node[]) => {
          var promsies: Promise<any>[] = []
          if (nodes) {
            node.childNodes = nodes
            node.children.forEach(node => {
              if (node.hasAttribute('slot-scope')) {
                node.external.needRender = true
                // @ts-ignore
                renderData([node], {})
              }
            })
          } else {
            this.handleCITraverse(node.children, collectRes, {}, promises)
          }
          return Promise.all(promises)
        }
        if (mm[name]) {
          mm[name].push(handler)
        } else {
          mm[name] = [handler]
        }
        return
      } else if (tag === 'include') {
        let ret = this.resolve(node.getAttribute('src'))
        if (ret && ret.path) {
          let assetDep = <HTMLAsset>this.resolveAsset(ret.path, {
            included: true,
            dynamic: true
          }, HTMLAsset)
          promises.push(assetDep.processWithData(node.attributes.attrs, collectRes).then(root => {
            // @ts-ignore
            if (ret.segment) {
              // @ts-ignore
              let ele = root.getElementById(ret.segment)
              if (ele) {
                node.replaceWith(ele)
              }
            } else {
              node.replaceWith(root)
            }
          }))
        }
        return
      } else if (tag.includes(':') || tag === 'component') {
        let name = tag.includes(':') ? tag : node.getAttribute('is')
        let assetDep = <ComponentAsset>this.resolveInlineAsset(name, ComponentAsset)
        let jsExport = node.getAttribute('js-export')
        promises.push((async () => {
          var promises: Promise<any>[] = [assetDep.process()]
          this.handleCITraverse(node.children, collectRes, mm, promises)
          await Promise.all(promises)
          let root = await assetDep.transformWithData(node.attributes.attrs, collectRes, node)
          node.name = 'template'
          if (root) {
            node.childNodes = [root]
          }
          if (assetDep.mainAsset) {
            this.addDependency(assetDep.mainAsset.name, {
              included: true
            })
            this.addAsset(assetDep.mainAsset.name, assetDep.mainAsset)
          }
          collectRes.styles.push(...assetDep.cssAssets)
          collectRes.scripts.push(...assetDep.jsAssets)
          let first = <JSAsset>collectRes.scripts[0]
          if (jsExport && first) {
            collectRes.scripts[0] = [first, jsExport]
          }
        })())
        return
      }
      let children = node.children
      if (children.length > 0) {
        this.handleCITraverse(children, collectRes, mm, promises)
      }
    })
  }
  async transformWithData(data: any, collectRes: CollectRes, collectedSlots?: CollectedSlots): Promise<RootNode> {
    var root = this.ast.clone()
    // @ts-ignore
    renderData(root.childNodes, data)
    await this.handleCI(root, data, collectRes, collectedSlots)
    return root
  }
  async processWithData(data: any, collectRes: CollectRes, collectedSlots?: CollectedSlots): Promise<RootNode> {
    await this.parseIfNeeded()
    var ast = await this.transformWithData(data, collectRes, collectedSlots)
    return ast
  }
  transformToType(ast: RootNode, type: string, data?: string) {
    var transpiler: any = getTranspiler(type, data)
    if (transpiler) {
      if (transpiler.filterMapping && this.options.template.filters) {
        Object.assign(transpiler.filterMapping, this.options.template.filters)
      }
      transpiler.handle(ast)
    }
  }
  render(ast: ElementNode) {
    return (this.options.minify ? renderMini : render)([ast])
  }
  async processAst(ast: RootNode, collectRes: CollectRes) {
    if (this.mainJSAsset || this.mainCSSAsset) {
      if (this.mainJSAsset) {
        await this.mainJSHandler(collectRes.scripts)
      }
      if (this.mainCSSAsset) {
        await this.mainCSSHandler(collectRes.styles)
      }
    }
    let template = this.options.template
    if (template.beforeTranspile) {
      template.beforeTranspile(ast)
    }
    if (template.type === 'js') {
      let url = template.getDevDataUrl && template.getDevDataUrl(this.name)
      if (url) {
        let dataName = '__data__'
        this.transformToType(ast, 'js', dataName)
        let func = `function(${dataName}){${this.render(ast)} return __html}`
        let js = `(${getFuncStr(getDevUrl)})('${url}').then(${getFuncStr(template.getDevDataTransformer)}).then(${func}).then(${getFuncStr(renderHtml)})`
        js = js.replace(/(<\/)(script>)/g, '$1`+`$2')
        ast = this.parse(devContainer)
        let [script] = ast.getElementsByTagName('script')
        script.text(js)
      }
    } else {
      if (template.type) {
        this.transformToType(ast, template.type)
      }
      if (template.onlyBody) {
        let [body] = getElementByTagName('body', ast)
        if (body) {
          ast.childNodes = body.childNodes
        }
      }
    }
    return ast
  }
  async process() {
    if (this.isSingleFile) {
      if (!this.contents) {
        await super.process()
        var collectRes: CollectRes = {
          styles: [],
          scripts: []
        }
        var root = await this.processWithData(this.options.template.getStaticData(this.name), collectRes)
        await this.processResources(root)
        root = await this.processAst(root, collectRes)
        this.contents = this.render(root)
        this.hash = md5(this.contents)
      }
    } else {
      return super.process()
    }
  }
}

function getFuncStr(func: Function) {
  var str = func.toString()
  if (!/^(\(|function\b)/.test(str)) {
    str = 'function ' + str
  }
  return str
}