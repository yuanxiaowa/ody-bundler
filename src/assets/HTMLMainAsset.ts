import HTMLAsset from "./HTMLAsset";
import JSAsset from "./JSAsset";
import CSSAsset from "./CSSAsset";
import Asset from "../Asset";
import ComponentAsset from "./ComponentAsset";
import { RootNode, ElementNode, TextNode } from "ody-html-tree/index";
import { getElementByTagName } from "ody-html-tree/util";
import { join } from "path";
import md5 from "../utils/md5";
import { CollectRes } from "../structs/index";

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
    let url = template.getDataUrl && template.getDataUrl(this.name)
    if (url) {
      let initor = template.extraInitor
      if (initor) {
        let [root] = getElementByTagName('body', ast)
        if (!root) {
          root = ast
        }
        let asset = this.resolveAsset(initor.liburl, {
          dynamic: true
        }, JSAsset)
        asset.skipTransform = true
        await asset.process()
        let elem = new ElementNode('div')
        let id = '__wrap__'
        elem.setAttribute('id', id)
        elem.style.add({
          height: '100%',
          display: 'none'
        })
        elem.setAttribute('v-show', '__loaded')
        elem.childNodes = root.childNodes
        root.childNodes = [elem]
        let elem1 = new ElementNode('script', { src: await asset.getGeneratedUrl() })
        root.appendChild(elem1)
        let elem2 = new ElementNode('script')
        elem2.appendChild(new TextNode(`(${getFuncStr(initor.handler)})('${url}','${id}')`))
        root.appendChild(elem2)
      }
    }
    if (template.beforeTranspile) {
      template.beforeTranspile(ast)
    }
    if (template.type) {
      this.transformToType(ast, template.type)
    }
    if (template.onlyBody) {
      let [body] = getElementByTagName('body', ast)
      if (body) {
        ast.childNodes = [body]
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