import { Options, Dep, DepOpts, GeneratedResult } from "./structs/index";
import * as Path from 'path'
import { readFile, writeFile, ensureDir } from 'fs-extra'
import isUrl from "./utils/is-url";
import * as URL from 'url'
import Bundler from "./Bundler";
import objectHash from "./utils/object-hash";
import * as request from 'request-promise-native'
import md5 from "./utils/md5";
import { sendToLocal, sendToNetwork } from "./Deployer";
import { EventEmitter } from "events";
import * as resolve from 'browser-resolve'

export default class Asset extends EventEmitter {
  basename: string
  type: string
  encoding: string | null = 'utf8'
  options: Options
  contents?: string | Buffer
  originalCode?: string | Buffer
  ast: any
  processed: boolean
  hash?: string
  // generated?: GeneratedResult
  dependencies = new Map<string, Dep>()
  depAssets = new Map<string, Asset>()
  parents = new Set<Asset>()
  isSingleFile = false
  packaged = false
  outDir: string
  skipTransform = false
  constructor(public name: string, public bundler: Bundler) {
    super()
    this.options = bundler.options
    this.basename = Path.basename(name)
    this.type = Path.extname(name).substring(1)
    this.init()
  }
  init() {
    this.outDir = this.type
  }
  addAsset(path: string, asset: Asset) {
    this.depAssets.set(path, asset)
    asset.parents.add(this)
  }
  resolve(name: string | undefined, from = this.name) {
    if (!name) {
      return
    }
    if (name.startsWith('data:')) {
      return
    }
    if (name.startsWith('//')) {
      if (this.options.isUrlNeedResolve(name)) {
        name = 'http:' + name
      } else {
        return
      }
    } else if (isUrl(name)) {
      if (!this.options.isUrlNeedResolve(name)) {
        return
      }
    } else {
      if (name.startsWith('~/')) {
        name = resolve.sync(name.substring(2))
        if (!name) {
          return
        }
      } else if (!name.startsWith('#')) {
        let key = Object.keys(this.options.resolve.alias).find(key => (<string>name).startsWith(key + '/'))
        if (key) {
          name = Path.resolve(this.options.resolve.alias[key], name.substring(key.length + 1))
        } else if (isUrl(from)) {
          name = URL.resolve(from, name)
        } else {
          if (name.startsWith('/')) {
            name = Path.join(process.cwd(), name)
          } else {
            name = Path.resolve(Path.dirname(from), name)
          }
        }
      }
    }
    let item = name.split('#')
    return {
      path: item[0],
      segment: item[1]
    }
  }
  getAsset(path: string, Ctor: typeof Asset) {
    if (this.bundler.loadedAssets.has(path)) {
      return <Asset>this.bundler.loadedAssets.get(path)
    }
    let asset = new Ctor(path, this.bundler)
    this.bundler.loadedAssets.set(path, asset)
    return asset
  }
  resolveAsset(path: string, dep: any, Ctor: typeof Asset, watch = true) {
    this.addDependency(path, dep)
    let asset = this.getAsset(path, Ctor)
    this.addAsset(path, asset)
    if (watch && this.bundler.watcher) {
      this.bundler.watcher.add(path)
    }
    return asset
  }
  resovleAssetWithExt(path: string, dep?: any) {
    var asset: Asset;
    if (this.bundler.loadedAssets.has(path)) {
      asset = <Asset>this.bundler.loadedAssets.get(path)
    } else {
      var Ctor = this.bundler.parser.findParser(path)
      asset = this.getAsset(path, Ctor)
      if (this.bundler.watcher) {
        this.bundler.watcher.add(path)
      }
    }
    this.addDependency(path, Object.assign({
      dynamic: true
    }, dep))
    this.addAsset(path, asset)
    return asset
  }
  resolveInlineAsset(path: string, Ctor: typeof Asset, content?: string, dep?: any) {
    this.addDependency(path, Object.assign({ included: true }, dep))
    let asset = new Ctor(path, this.bundler)
    asset.isSingleFile = false
    if (content) {
      asset.originalCode = content
    }
    this.addAsset(path, asset)
    return asset
  }
  getInlineContentName(type: string, content: string, from = this.name) {
    return from + '.' + md5(content) + type
  }
  async load() {
    if (!this.encoding) {
      return readFile(this.name)
    }
    return readFile(this.name, this.encoding)
  }
  loadUrl() {
    return request.get(this.name, {
      encoding: this.encoding,
      gzip: true
    })
  }
  async loadIfNeeded() {
    if (!this.originalCode) {
      // @ts-ignore
      this.originalCode = await (isUrl(this.name) ? this.loadUrl() : this.load())
    }
  }
  async getDependencies() {
    await this.loadIfNeeded()
    if (this.mightHaveDependencies()) {
      await this.parseIfNeeded()
      this.collectDependencies()
    }
  }
  collectDependencies() { }
  addDependency(name: string, opts?: any) {
    // @ts-ignore
    this.dependencies.set(name, Object.assign({ name }, opts))
  }
  addURLDependency(url: string, opts?: any) {
    var ret = this.resolve(url)
    if (ret) {
      this.addDependency(ret.path, Object.assign({ dynamic: true }, opts))
    }
    return ret
  }
  parse(content: any) { }
  async parseIfNeeded() {
    await this.loadIfNeeded()
    if (!this.ast) {
      this.ast = await this.parse(this.originalCode)
    }
  }
  mightHaveDependencies() {
    return true
  }
  async process(): Promise<any> {
    if (this.processed) {
      return new Promise((resolve, reject) => {
        this.once('processEnd', resolve)
      })
    }
    if (!this.contents) {
      this.processed = true
      try {
        await this.loadIfNeeded()
        this.contents = this.originalCode
        await this.getDependencies()
        if (!this.skipTransform) {
          await this.transform()
        }
        this.hash = this.generateBundleName()
        this.emit('processEnd')
      } catch (e) {
        throw e
      } finally {
        this.processed = false
      }
    }
  }
  /* async processWithData(...args: any[]): Promise<any> {
    await this.loadIfNeeded()
    await this.getDependencies()
    return this.transformWithData(...args)
  } */
  async transform(): Promise<any> { }
  // async transformWithData(...args: any[]): Promise<any> { }
  /* generate(content: string | Buffer): GeneratedResult {
    // @ts-ignore
    return {
      [this.type]: content
    }
  } */
  invalidate() {
    this.originalCode = undefined
    this.ast = undefined
    this.invalidateBundle()
  }
  invalidateBundle() {
    this.contents = undefined
    this.hash = undefined
    this.processed = false
    // this.generated = undefined
    this.packaged = false
    this.dependencies.clear()
    this.depAssets.clear()
  }
  generateBundleName() {
    return md5(this.options.hashContent ? <string>this.contents : this.name)
  }
  get generatedUrl() {
    return this.options.publicURL + this.generatedPath
  }
  get generatedPath() {
    let mask = this.options.getOutputMask(this.name, this.type)
    if (mask) {
      return this.resolveMask(mask)
    }
    return Path
      .join(
      this.outDir,
      this.hash
      )
      .replace(/\\/g, '/') + '.' + this.type
  }
  async getGeneratedUrl(type = 'html') {
    if (this.options.getGeneratedUrl) {
      let url = await this.options.getGeneratedUrl(this, type)
      if (url) {
        return url
      }
    }
    if (this.options.dynamicDomain) {
      if (type === 'html') {
        return `{{${this.options.dynamicDomain}}}${this.generatedUrl}`
      } else if (type === 'js') {
        return `window["${this.options.dynamicDomain}"]+'${this.generatedUrl}'`
      }
    } else if (type === 'js') {
      return `'${this.generatedUrl}'`
    }
    return this.generatedUrl
  }
  resolveMask(name: string) {
    let items = this.name.split(Path.sep)
    return name.replace(/\[(.*?)\]/g, (_: string, item: string) => {
      if (item === 'hash') {
        return <string>this.hash
      }
      if (item === 'name') {
        return Path.basename(this.name, Path.extname(this.name))
      }
      if (item === 'ext') {
        return Path.extname(this.name)
      }
      if (/(-?\d+)/.test(item)) {
        let i = Number(item)
        if (i < 0) {
          i = items.length + i
        }
        return items[i]
      }
      return item
    })
  }
  toString() {
    return this.contents;
  }
  packaging = false
  async package() {
    if (this.packaged) {
      return
    }
    if (this.packaging) {
      return new Promise((resolve, reject) => {
        this.once('packageEnd', resolve)
      })
    }
    try {
      this.packaging = true
      var content = this.contents
      let keepLocal = true
      let deployer = this.options.deployer
      if (deployer) {
        keepLocal = !!deployer.keepLocal
        if (deployer.handlers) {
          deployer.handlers.forEach(handler => {
            let url: any
            if (typeof handler === 'string') {
              url = handler
            } else {
              url = handler(this.name, this.type)
            }
            if (url) {
              let path = this.generatedPath
              if (typeof url === 'function') {
                url(path, content)
              } else if (isUrl(url)) {
                this.bundler.logger.log(`上传文件 ${this.name} -> ${url} : ${path}`)
                sendToNetwork(url, path, content)
              } else {
                this.bundler.logger.log(`复制文件 ${this.name} -> ${url} : ${path}`)
                sendToLocal(url, path, content)
              }
            }
          })
        }
      }
      if (keepLocal) {
        let path = Path.join(this.options.outDir, this.generatedPath)
        await ensureDir(Path.dirname(path))
        await writeFile(path, content)
      }
      this.packaged = true
      this.emit('packageEnd')
    } catch (e) {
      throw e
    } finally {
      this.packaging = false
    }
  }
}