"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Asset_1 = require("../Asset");
const postcss = require("postcss");
// @ts-ignore
const AtImport = require("postcss-import");
// @ts-ignore
const valueParser = require("postcss-value-parser");
const ImageAsset_1 = require("./ImageAsset");
const autoprefixer = require("autoprefixer");
const URL_RE = /url\s*\(\"?(?![a-z]+:)/;
const IMPORT_RE = /@import/;
const PROTOCOL_RE = /^[a-z]+:/;
class CSSAsset extends Asset_1.default {
    constructor() {
        super(...arguments);
        this.extraAssets = {};
    }
    init() {
        super.init();
        this.type = 'css';
        this.outDir = 'styles';
    }
    mightHaveDependencies() {
        return (!this.name.endsWith('.css')
            || IMPORT_RE.test(this.contents)
            || URL_RE.test(this.contents));
    }
    async transform() {
        var content = this.contents;
        var extraAssets = new Set();
        Object.keys(this.extraAssets).forEach(key => {
            this.extraAssets[key].forEach(asset => {
                extraAssets.add(asset);
            });
        });
        extraAssets.forEach(item => {
            content = `@import "${item.name.replace(/\\/g, '/')}";` + content;
        });
        var result = await postcss([AtImport({
                load: async (filename) => {
                    var asset = this.resolveAsset(filename, {
                        dynamic: true,
                        included: true
                    }, CSSAsset);
                    await asset.loadIfNeeded();
                    var content = asset.originalCode;
                    return content.replace(/(@import\s+["'])(.*?)(?=["'])/g, (_, prefix, url) => {
                        var ret = this.resolve(url, filename);
                        if (!ret) {
                            return prefix + url;
                        }
                        return prefix + ret.path.replace(/\\/g, '/');
                    });
                }
            })]).process(content, {
            from: this.name,
            map: this.options.map ? {
                inline: true
            } : undefined
        });
        if (result.root) {
            let promises = [];
            result.root.walkDecls(decl => {
                if (URL_RE.test(decl.value)) {
                    let parsed = valueParser(decl.value);
                    let _promises = [];
                    parsed.walk((node) => {
                        if (node.type === 'function' &&
                            node.value === 'url' &&
                            node.nodes.length > 0) {
                            let ret = this.resolve(node.nodes[0].value, decl.source.input.from);
                            if (ret && ret.path) {
                                let asset = this.resolveAsset(ret.path, {
                                    dynamic: true,
                                    loc: decl.source.start
                                }, ImageAsset_1.default);
                                _promises.push(asset.process().then(() => {
                                    node.nodes[0].value = asset.generatedPath;
                                }));
                            }
                        }
                    });
                    if (_promises.length > 0) {
                        promises.push(Promise.all(_promises).then(() => {
                            decl.value = parsed.toString();
                        }));
                    }
                }
            });
            await Promise.all(promises);
            let plugins = [...this.options.style.plugins, autoprefixer({
                    browsers: this.options.style.autoprefixer
                })];
            if (this.options.minify) {
                // @ts-ignore
                let cssnano = await Promise.resolve().then(() => require('cssnano'));
                plugins.push(cssnano);
            }
            let { css } = await postcss(plugins).process(result.root, {
                from: this.name,
                map: this.options.map ? {
                    inline: true
                } : undefined
            });
            this.contents = css;
        }
    }
}
exports.default = CSSAsset;
