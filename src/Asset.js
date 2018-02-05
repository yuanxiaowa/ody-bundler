"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Path = require("path");
const fs_extra_1 = require("fs-extra");
const is_url_1 = require("./utils/is-url");
const URL = require("url");
const request = require("request-promise-native");
const md5_1 = require("./utils/md5");
const Deployer_1 = require("./Deployer");
const events_1 = require("events");
const resolve = require("browser-resolve");
class Asset extends events_1.EventEmitter {
    constructor(name, bundler) {
        super();
        this.name = name;
        this.bundler = bundler;
        this.encoding = 'utf8';
        // generated?: GeneratedResult
        this.dependencies = new Map();
        this.depAssets = new Map();
        this.parents = new Set();
        this.isSingleFile = false;
        this.packaged = false;
        this.skipTransform = false;
        this.packaging = false;
        this.options = bundler.options;
        this.basename = Path.basename(name);
        this.type = Path.extname(name).substring(1);
        this.init();
    }
    init() {
        this.outDir = this.type;
    }
    addAsset(path, asset) {
        this.depAssets.set(path, asset);
        asset.parents.add(this);
    }
    resolve(name, from = this.name) {
        if (!name) {
            return;
        }
        if (name.startsWith('data:')) {
            return;
        }
        if (name.startsWith('//')) {
            if (this.options.isUrlNeedResolve(name)) {
                name = 'http:' + name;
            }
            else {
                return;
            }
        }
        else if (is_url_1.default(name)) {
            if (!this.options.isUrlNeedResolve(name)) {
                return;
            }
        }
        else {
            if (name.startsWith('~/')) {
                name = resolve.sync(name.substring(2));
                if (!name) {
                    return;
                }
            }
            else if (!name.startsWith('#')) {
                let key = Object.keys(this.options.resolve.alias).find(key => name.startsWith(key + '/'));
                if (key) {
                    name = Path.resolve(this.options.resolve.alias[key], name.substring(key.length + 1));
                }
                else if (is_url_1.default(from)) {
                    name = URL.resolve(from, name);
                }
                else {
                    if (name.startsWith('/')) {
                        name = Path.join(process.cwd(), name);
                    }
                    else {
                        name = Path.resolve(Path.dirname(from), name);
                    }
                }
            }
        }
        let item = name.split('#');
        return {
            path: item[0],
            segment: item[1]
        };
    }
    getAsset(path, Ctor) {
        if (this.bundler.loadedAssets.has(path)) {
            return this.bundler.loadedAssets.get(path);
        }
        let asset = new Ctor(path, this.bundler);
        this.bundler.loadedAssets.set(path, asset);
        return asset;
    }
    resolveAsset(path, dep, Ctor, watch = true) {
        this.addDependency(path, dep);
        let asset = this.getAsset(path, Ctor);
        this.addAsset(path, asset);
        if (watch && this.bundler.watcher) {
            this.bundler.watcher.add(path);
        }
        return asset;
    }
    resovleAssetWithExt(path, dep) {
        var asset;
        if (this.bundler.loadedAssets.has(path)) {
            asset = this.bundler.loadedAssets.get(path);
        }
        else {
            var Ctor = this.bundler.parser.findParser(path);
            asset = this.getAsset(path, Ctor);
            if (this.bundler.watcher) {
                this.bundler.watcher.add(path);
            }
        }
        this.addDependency(path, Object.assign({
            dynamic: true
        }, dep));
        this.addAsset(path, asset);
        return asset;
    }
    resolveInlineAsset(path, Ctor, content, dep) {
        this.addDependency(path, Object.assign({ included: true }, dep));
        let asset = new Ctor(path, this.bundler);
        asset.isSingleFile = false;
        if (content) {
            asset.originalCode = content;
        }
        this.addAsset(path, asset);
        return asset;
    }
    getInlineContentName(type, content, from = this.name) {
        return from + '.' + md5_1.default(content) + type;
    }
    async load() {
        if (!this.encoding) {
            return fs_extra_1.readFile(this.name);
        }
        return fs_extra_1.readFile(this.name, this.encoding);
    }
    loadUrl() {
        return request.get(this.name, {
            encoding: this.encoding,
            gzip: true
        });
    }
    async loadIfNeeded() {
        if (!this.originalCode) {
            // @ts-ignore
            this.originalCode = await (is_url_1.default(this.name) ? this.loadUrl() : this.load());
        }
    }
    async getDependencies() {
        await this.loadIfNeeded();
        if (this.mightHaveDependencies()) {
            await this.parseIfNeeded();
            this.collectDependencies();
        }
    }
    collectDependencies() { }
    addDependency(name, opts) {
        // @ts-ignore
        this.dependencies.set(name, Object.assign({ name }, opts));
    }
    addURLDependency(url, opts) {
        var ret = this.resolve(url);
        if (ret) {
            this.addDependency(ret.path, Object.assign({ dynamic: true }, opts));
        }
        return ret;
    }
    parse(content) { }
    async parseIfNeeded() {
        await this.loadIfNeeded();
        if (!this.ast) {
            this.ast = await this.parse(this.originalCode);
        }
    }
    mightHaveDependencies() {
        return true;
    }
    async process() {
        if (this.processed) {
            return new Promise((resolve, reject) => {
                this.once('processEnd', resolve);
            });
        }
        if (!this.contents) {
            this.processed = true;
            try {
                await this.loadIfNeeded();
                this.contents = this.originalCode;
                await this.getDependencies();
                if (!this.skipTransform) {
                    await this.transform();
                }
                this.hash = this.generateBundleName();
                this.emit('processEnd');
            }
            catch (e) {
                throw e;
            }
            finally {
                this.processed = false;
            }
        }
    }
    /* async processWithData(...args: any[]): Promise<any> {
      await this.loadIfNeeded()
      await this.getDependencies()
      return this.transformWithData(...args)
    } */
    async transform() { }
    // async transformWithData(...args: any[]): Promise<any> { }
    /* generate(content: string | Buffer): GeneratedResult {
      // @ts-ignore
      return {
        [this.type]: content
      }
    } */
    invalidate() {
        this.originalCode = undefined;
        this.ast = undefined;
        this.invalidateBundle();
    }
    invalidateBundle() {
        this.contents = undefined;
        this.hash = undefined;
        this.processed = false;
        // this.generated = undefined
        this.packaged = false;
        this.dependencies.clear();
        this.depAssets.clear();
    }
    generateBundleName() {
        return md5_1.default(this.options.hashContent ? this.contents : this.name);
    }
    get generatedUrl() {
        return this.options.publicURL + this.generatedPath;
    }
    get generatedPath() {
        let mask = this.options.getOutputMask(this.name, this.type);
        if (mask) {
            return this.resolveMask(mask);
        }
        return Path
            .join(this.outDir, this.hash)
            .replace(/\\/g, '/') + '.' + this.type;
    }
    async getGeneratedUrl(type = 'html') {
        if (this.options.getGeneratedUrl) {
            let url = await this.options.getGeneratedUrl(this, type);
            if (url) {
                return url;
            }
        }
        if (this.options.dynamicDomain) {
            if (type === 'html') {
                return `{{${this.options.dynamicDomain}}}${this.generatedUrl}`;
            }
            else if (type === 'js') {
                return `window["${this.options.dynamicDomain}"]+'${this.generatedUrl}'`;
            }
        }
        else if (type === 'js') {
            return `'${this.generatedUrl}'`;
        }
        return this.generatedUrl;
    }
    resolveMask(name) {
        let items = this.name.split(Path.sep);
        return name.replace(/\[(.*?)\]/g, (_, item) => {
            if (item === 'hash') {
                return this.hash;
            }
            if (item === 'name') {
                return Path.basename(this.name, Path.extname(this.name));
            }
            if (item === 'ext') {
                return Path.extname(this.name);
            }
            if (/(-?\d+)/.test(item)) {
                let i = Number(item);
                if (i < 0) {
                    i = items.length + i;
                }
                return items[i];
            }
            return item;
        });
    }
    toString() {
        return this.contents;
    }
    async package() {
        if (this.packaged) {
            return;
        }
        if (this.packaging) {
            return new Promise((resolve, reject) => {
                this.once('packageEnd', resolve);
            });
        }
        try {
            this.packaging = true;
            var content = this.contents;
            let keepLocal = true;
            let deployer = this.options.deployer;
            if (deployer) {
                keepLocal = !!deployer.keepLocal;
                if (deployer.handlers) {
                    deployer.handlers.forEach(handler => {
                        let url;
                        if (typeof handler === 'string') {
                            url = handler;
                        }
                        else {
                            url = handler(this.name, this.type);
                        }
                        if (url) {
                            let path = this.generatedPath;
                            if (typeof url === 'function') {
                                url(path, content);
                            }
                            else if (is_url_1.default(url)) {
                                this.bundler.logger.log(`上传文件 ${this.name} -> ${url} : ${path}`);
                                Deployer_1.sendToNetwork(url, path, content);
                            }
                            else {
                                this.bundler.logger.log(`复制文件 ${this.name} -> ${url} : ${path}`);
                                Deployer_1.sendToLocal(url, path, content);
                            }
                        }
                    });
                }
            }
            if (keepLocal) {
                let path = Path.join(this.options.outDir, this.generatedPath);
                await fs_extra_1.ensureDir(Path.dirname(path));
                await fs_extra_1.writeFile(path, content);
            }
            this.packaged = true;
            this.emit('packageEnd');
        }
        catch (e) {
            throw e;
        }
        finally {
            this.packaging = false;
        }
    }
}
exports.default = Asset;
