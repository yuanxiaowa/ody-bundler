import { Options, Dep } from "./structs/index";
import Resolver from "./Resolver";
import Parser from "./Parser";
import Asset from "./Asset";
import { FSWatcher, watch } from 'chokidar'
import Logger from "./Logger";
import * as glob from 'glob'
import { EventEmitter } from "events";
import { mkdirp } from "fs-extra";
import WorkerFarm from "./WorkerFarm";
import HTMLMainAsset from "./assets/HTMLMainAsset";
import * as Path from 'path'

export default class Bundler extends EventEmitter {
  resolver: Resolver
  parser: Parser
  pending = false
  watcher: FSWatcher
  logger: Logger
  farm: WorkerFarm
  loadedAssets = new Map<string, Asset>()
  buildQueue = new Set<Asset>()
  rebuildTimeout: NodeJS.Timer
  isInitial = true
  mainAssets = new Set<Asset>()

  constructor(public options: Options) {
    super()
    this.resolver = new Resolver(this)
    this.parser = new Parser(this)
    this.logger = new Logger(options)
  }
  async start() {
    if (this.farm) {
      return
    }
    this.farm = WorkerFarm.getShared(this)
    if (this.options.watch) {
      this.watcher = new FSWatcher({
        useFsEvents: this.options.env !== 'test'
      })
      this.watcher.on('change', this.onChange.bind(this));
    }
  }
  async buildQueuedAssets() {
    if (this.buildQueue.size > 0) {
      let promises: Promise<void>[] = []
      let assets = [...this.buildQueue]
      this.buildQueue.clear()
      let packagedAssets = new Set<Asset>()
      for (let asset of assets) {
        asset.invalidate()
        promises.push(this.loadAsset(asset, packagedAssets))
      }
      await Promise.all(promises)
      assets.forEach(asset => {
        if (asset.isSingleFile) {
          this.collectPackageAssets(asset, packagedAssets)
        }
      })
      await Promise.all([...packagedAssets].map(asset => asset.package()))
    }
  }
  collectPackageAssets(asset: Asset, packagedAssets: Set<Asset>) {
    for (let dep of [...asset.dependencies.values()]) {
      if (!dep.included) {
        let _asset = (<Asset>asset.depAssets.get(dep.name))
        packagedAssets.add(_asset)
        this.collectPackageAssets(_asset, packagedAssets)
      }
    }
  }
  async loadAsset(asset: Asset, packagedAssets: Set<Asset>) {
    await asset.process()
    if (asset.isSingleFile) {
      packagedAssets.add(asset)
    }
    await Promise.all(Array.from(asset.parents).map(item => {
      var dep = <Dep>item.dependencies.get(asset.name)
      if (dep.included) {
        item.invalidateBundle()
        return this.loadAsset(item, packagedAssets)
      }
    }))
  }
  unloadAsset(asset: Asset) {
    this.loadedAssets.delete(asset.name)
  }
  onChange(path: string) {
    var asset = this.loadedAssets.get(path)
    if (!asset) {
      return
    }
    this.logger.clear()
    this.logger.status('⏳', `编译文件 ${Path.relative('.', asset.name)}`)
    this.buildQueue.add(asset)
    clearTimeout(this.rebuildTimeout)

    this.rebuildTimeout = setTimeout(() => {
      this.bundle()
    }, 100)
  }
  async bundle() {
    if (this.pending) {
      return new Promise((resolve, reject) => {
        this.once('buildEnd', () => {
          this.bundle().then(resolve, reject)
        })
      })
    }
    let startTime = Date.now()
    this.pending = true
    try {
      await this.start()
      if (this.isInitial) {
        await mkdirp(this.options.outDir)
        let filenames = <string[]>await new Promise((resolve, reject) => {
          glob(this.options.entry, {
            absolute: true
          }, (err, matches) => {
            if (err) {
              return reject(err)
            }
            resolve(matches)
          })
        })
        filenames.forEach(filename => {
          this.logger.status('⏳', `编译文件 ${Path.relative('.', filename)}`)
        })
        var assets = await Promise.all(filenames.map(filename => this.addMainAsset(filename)))
        if (this.options.watch) {
          watch(this.options.entry, {
            ignoreInitial: true
          }).on('add', async path => {
            await this.addMainAsset(path)
            this.bundle()
          }).on('unlink', path => {
            var asset = this.loadedAssets.get(path)
            if (asset) {
              this.mainAssets.delete(asset)
              this.loadedAssets.delete(path)
            }
          })
        }
      }
      this.isInitial = false
      await this.buildQueuedAssets()
      let buildTime = Date.now() - startTime;
      let time =
        buildTime < 1000
          ? `${buildTime}ms`
          : `${(buildTime / 1000).toFixed(2)}s`
      this.logger.status('✨', `构建用时 ${time}.`, 'green')
    } catch (e) {
      debugger
      this.logger.error(e)
    } finally {
      this.pending = false
      this.emit('buildEnd');
    }
  }
  async addMainAsset(name: string) {
    var asset = await this.resolveAsset(name, undefined, HTMLMainAsset)
    this.mainAssets.add(asset)
    this.buildQueue.add(asset)
    return asset
  }
  async resolveAsset(name: string, parent?: string, Ctor?: typeof Asset) {
    var asset: Asset;
    var path: string = this.resolver.resolve(name, parent)
    if (this.loadedAssets.has(path)) {
      return <Asset>this.loadedAssets.get(path)
    }
    if (Ctor) {
      asset = new Ctor(path, this)
    } else {
      asset = this.parser.getAsset(path)
    }
    this.loadedAssets.set(path, asset)
    if (this.watcher) {
      this.watcher.add(path)
    }
    return asset
  }
}