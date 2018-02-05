import Asset from "../Asset";
import Bundler from "../Bundler";
import * as glob from 'glob'
import * as Path from 'path'
import { Dep, CollectedSlots, CollectRes } from "../structs/index";
import HTMLAsset from "./HTMLAsset";
import JSAsset from "./JSAsset";
import CSSAsset from "./CSSAsset";
import { ElementNode, Node } from "ody-html-tree/index";
import { readFileSync } from "fs-extra";
import md5 from "../utils/md5";

export default class ComponentAsset extends Asset {
  contents: any
  componentName: string
  namespace: string
  mainAsset?: HTMLAsset
  cssAssets = new Set<CSSAsset>()
  jsAssets = new Set<JSAsset>()
  init() {
    this.type = 'component'
    var items = this.name.split(':')
    this.componentName = items[1]
    this.namespace = items[0]
    this.name = Path.resolve(this.options.components[this.namespace], this.componentName, '*')
  }
  load(): Promise<any> {
    var dir = Path.dirname(this.name)
    return new Promise((resolve, reject) => {
      glob(this.name, {
        // absolute: true,
        nodir: true
      }, (err, matches) => {
        if (err) {
          return reject(err)
        }
        matches = matches.map(name => Path.basename(name))
        var ret: any = {}
        if (matches.includes('setting.js') || matches.includes('setting.json')) {
          ret = readFileSync(dir + '/setting')
        } else {
          if (matches.includes('index.html')) {
            ret.index = 'index.html'
          } else if (matches.includes(this.componentName + '.html')) {
            ret.index = this.componentName + '.html'
          }
          ret.styles = []
          if (matches.includes('index.css')) {
            ret.styles.push('index.css')
          } else if (matches.includes(this.componentName + '.css')) {
            ret.styles.push(this.componentName + '.css')
          }
          ret.scripts = []
          if (matches.includes('index.js')) {
            ret.scripts.push('index.js')
          } else if (matches.includes(this.componentName + '.js')) {
            ret.scripts.push(this.componentName + '.js')
          }
        }
        resolve(ret)
      })
    })
  }
  collectDependencies() {
    var { index, scripts, styles }: { index: string, scripts: string[], styles: string[] } = this.contents
    var ret = this.resolve(index)
    if (ret) {
      this.mainAsset = <HTMLAsset>this.resolveAsset(ret.path, {
        dynamic: true
      }, HTMLAsset)
    }
    var jsAssets = <JSAsset[]>scripts.map(url => {
      var ret = this.resolve(url)
      if (ret) {
        return this.resolveAsset(ret.path, {
          dynamic: true
        }, JSAsset)
      }
    }).filter(Boolean)
    this.jsAssets = new Set(jsAssets)
    var cssAssets = <CSSAsset[]>styles.map(url => {
      var ret = this.resolve(url)
      if (ret) {
        return this.resolveAsset(ret.path, {
          dynamic: true
        }, CSSAsset)
      }
    }).filter(Boolean)
    this.cssAssets = new Set(cssAssets)
  }
  generateBundleName() {
    return md5(this.name)
  }
  async transformWithData(data: any, collectRes: CollectRes, node: ElementNode) {
    if (this.mainAsset) {
      let slotCols: CollectedSlots = {
        defaults: []
      };
      collectSlots(node.childNodes, slotCols)
      let root = await this.mainAsset.processWithData(data, collectRes, slotCols)
      let elem = root.children[0]
      if (elem) {
        if (data.class) {
          elem.classList.add(...data.class.split(/\s+/))
        }
        if (data.style) {
          elem.style.addString(data.style)
        }
        if (data.id) {
          elem.setAttribute('id', data.id)
        }
      }
      return root
    }
  }
}

function collectSlots(nodes: Node[], ret: CollectedSlots) {
  nodes.forEach(node => {
    if (node.isElement()) {
      if (node.hasAttribute('slot')) {
        let name = node.getAttribute('slot')
        node.removeAttribute('slot')
        if (name in ret) {
          ret[name].push(node)
        } else {
          ret[name] = [node]
        }
        return;
      }
    }
    ret.defaults.push(node)
  })
}