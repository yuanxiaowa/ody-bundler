import HTMLAsset from "./HTMLAsset";
import JSAsset from "./JSAsset";
import CSSAsset from "./CSSAsset";
import Asset from "../Asset";
import ComponentAsset from "./ComponentAsset";
import { RootNode, ElementNode, TextNode } from "ody-html-tree/index";
import { getElementByTagName, parse } from "ody-html-tree/util";
import { join } from "path";
import md5 from "../utils/md5";
import { CollectRes } from "../structs/index";

function getDevUrl(url: string) {
  return new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest()
    xhr.open('get', url)
    xhr.onload = () => resolve(xhr.response)
    xhr.onerror = reject
    xhr.send()
  })
}

const devContainer = '<html><body><style>html,body{height:100%;margin:0}iframe{width:100%;height:100%;border:0}</style><iframe id="ifr"></iframe><script></script></body></html>'
function renderHtml(html:string) {
  var iframe = <HTMLIFrameElement>document.getElementById('ifr')
  iframe.contentDocument.write(html)
}

export default class HTMLMainAsset extends HTMLAsset {
  init() {
    super.init()
    this.isSingleFile = true
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
    let url = template.getDevDataUrl && template.getDevDataUrl(this.name)
    if (template.beforeTranspile) {
      template.beforeTranspile(ast)
    }
    if (url) {
      let dataName = '__data__'
      this.transformToType(ast, 'js', dataName)
      let func = `function(${dataName}){${this.render(ast)} return __html}`
      let js = `(${getFuncStr(getDevUrl)})('${url}').then(${getFuncStr(template.getDevDataTransformer)}).then(${func}).then(${getFuncStr(renderHtml)})`
      ast = this.parse(devContainer)
      let [script] = ast.getElementsByTagName('script')
      script.text(js)
    } else {
      if (template.type) {
        this.transformToType(ast, template.type)
      }
      if (template.onlyBody) {
        let [body] = getElementByTagName('body', ast)
        if (body) {
          ast.childNodes = [body]
        }
      }
    }
    return ast
  }
  async process() {
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
  }
}

function getFuncStr(func: Function) {
  var str = func.toString()
  if (!/^(\(|function\b)/.test(str)) {
    str = 'function ' + str
  }
  return str
}