"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Resolver_1 = require("./Resolver");
const Parser_1 = require("./Parser");
const chokidar_1 = require("chokidar");
const Logger_1 = require("./Logger");
const glob = require("glob");
const events_1 = require("events");
const fs_extra_1 = require("fs-extra");
const WorkerFarm_1 = require("./WorkerFarm");
const HTMLMainAsset_1 = require("./assets/HTMLMainAsset");
const Path = require("path");
class Bundler extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.options = options;
        this.pending = false;
        this.loadedAssets = new Map();
        this.buildQueue = new Set();
        this.isInitial = true;
        this.mainAssets = new Set();
        this.resolver = new Resolver_1.default(this);
        this.parser = new Parser_1.default(this);
        this.logger = new Logger_1.default(options);
    }
    async start() {
        if (this.farm) {
            return;
        }
        this.farm = WorkerFarm_1.default.getShared(this);
        if (this.options.watch) {
            this.watcher = new chokidar_1.FSWatcher({
                useFsEvents: this.options.env !== 'test'
            });
            this.watcher.on('change', this.onChange.bind(this));
        }
    }
    async buildQueuedAssets() {
        if (this.buildQueue.size > 0) {
            let promises = [];
            let assets = [...this.buildQueue];
            this.buildQueue.clear();
            let packagedAssets = new Set();
            for (let asset of assets) {
                asset.invalidate();
                promises.push(this.loadAsset(asset, packagedAssets));
            }
            await Promise.all(promises);
            assets.forEach(asset => {
                if (asset.isSingleFile) {
                    this.collectPackageAssets(asset, packagedAssets);
                }
            });
            await Promise.all([...packagedAssets].map(asset => asset.package()));
        }
    }
    collectPackageAssets(asset, packagedAssets) {
        for (let dep of [...asset.dependencies.values()]) {
            if (!dep.included) {
                let _asset = asset.depAssets.get(dep.name);
                packagedAssets.add(_asset);
                this.collectPackageAssets(_asset, packagedAssets);
            }
        }
    }
    async loadAsset(asset, packagedAssets) {
        await asset.process();
        if (asset.isSingleFile) {
            packagedAssets.add(asset);
        }
        await Promise.all(Array.from(asset.parents).map(item => {
            var dep = item.dependencies.get(asset.name);
            if (dep.included) {
                item.invalidateBundle();
                return this.loadAsset(item, packagedAssets);
            }
        }));
    }
    unloadAsset(asset) {
        this.loadedAssets.delete(asset.name);
    }
    onChange(path) {
        var asset = this.loadedAssets.get(path);
        if (!asset) {
            return;
        }
        this.logger.clear();
        this.logger.status('⏳', `编译文件 ${Path.relative('.', asset.name)}`);
        this.buildQueue.add(asset);
        clearTimeout(this.rebuildTimeout);
        this.rebuildTimeout = setTimeout(() => {
            this.bundle();
        }, 100);
    }
    async bundle() {
        if (this.pending) {
            return new Promise((resolve, reject) => {
                this.once('buildEnd', () => {
                    this.bundle().then(resolve, reject);
                });
            });
        }
        let startTime = Date.now();
        this.pending = true;
        try {
            await this.start();
            if (this.isInitial) {
                await fs_extra_1.mkdirp(this.options.outDir);
                let filenames = await new Promise((resolve, reject) => {
                    glob(this.options.entry, {
                        absolute: true
                    }, (err, matches) => {
                        if (err) {
                            return reject(err);
                        }
                        resolve(matches);
                    });
                });
                filenames.forEach(filename => {
                    this.logger.status('⏳', `编译文件 ${Path.relative('.', filename)}`);
                });
                var assets = await Promise.all(filenames.map(filename => this.addMainAsset(filename)));
                if (this.options.watch) {
                    chokidar_1.watch(this.options.entry, {
                        ignoreInitial: true
                    }).on('add', async (path) => {
                        await this.addMainAsset(path);
                        this.bundle();
                    }).on('unlink', path => {
                        var asset = this.loadedAssets.get(path);
                        if (asset) {
                            this.mainAssets.delete(asset);
                            this.loadedAssets.delete(path);
                        }
                    });
                }
            }
            this.isInitial = false;
            await this.buildQueuedAssets();
            let buildTime = Date.now() - startTime;
            let time = buildTime < 1000
                ? `${buildTime}ms`
                : `${(buildTime / 1000).toFixed(2)}s`;
            this.logger.status('✨', `构建用时 ${time}.`, 'green');
        }
        catch (e) {
            debugger;
            this.logger.error(e);
        }
        finally {
            this.pending = false;
            this.emit('buildEnd');
        }
    }
    async addMainAsset(name) {
        var asset = await this.resolveAsset(name, undefined, HTMLMainAsset_1.default);
        this.mainAssets.add(asset);
        this.buildQueue.add(asset);
        return asset;
    }
    async resolveAsset(name, parent, Ctor) {
        var asset;
        var path = this.resolver.resolve(name, parent);
        if (this.loadedAssets.has(path)) {
            return this.loadedAssets.get(path);
        }
        if (Ctor) {
            asset = new Ctor(path, this);
        }
        else {
            asset = this.parser.getAsset(path);
        }
        this.loadedAssets.set(path, asset);
        if (this.watcher) {
            this.watcher.add(path);
        }
        return asset;
    }
}
exports.default = Bundler;
