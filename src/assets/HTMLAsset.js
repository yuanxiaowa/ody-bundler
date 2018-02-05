"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Asset_1 = require("../Asset");
const util_1 = require("ody-html-tree/util");
const JSAsset_1 = require("./JSAsset");
const render_static_1 = require("render-static");
const JSInlineAsset_1 = require("./JSInlineAsset");
const CSSInlineAsset_1 = require("./CSSInlineAsset");
const ComponentAsset_1 = require("./ComponentAsset");
const CSSAsset_1 = require("./CSSAsset");
const ImageAsset_1 = require("./ImageAsset");
const util_2 = require("ody-transpiler/util");
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
};
class HTMLAsset extends Asset_1.default {
    init() {
        super.init();
        this.type = 'html';
    }
    parse(content) {
        return util_1.parse(content, this.name);
    }
    // 处理资源
    processResources(root) {
        var promises = [];
        this.traverseNodes(root.children, root, promises);
        return Promise.all(promises);
    }
    traverseNodes(nodes, ast, promises) {
        nodes.forEach(node => {
            this.traverseElementNode(node, ast, promises);
        });
    }
    resolveNodePath(node, name) {
        return this.resolve(name, node.source.filename);
    }
    traverseElementNode(node, ast, promises) {
        var tag = node.name;
        if (tag === 'img') {
            let ret = this.resolveNodePath(node, node.getAttribute('src'));
            if (ret && ret.path) {
                let dep = {
                    dynamic: true
                };
                if (node.hasAttribute('__inline') && this.options.env === 'production') {
                    dep.included = true;
                }
                let assetDep = this.resolveAsset(ret.path, dep, ImageAsset_1.default);
                assetDep.isSingleFile = assetDep.isSingleFile || !dep.included;
                if (dep.included) {
                    promises.push(assetDep.process().then(() => {
                        // @ts-ignore
                        node.setAttribute('src', assetDep.toString());
                        node.removeAttribute('__inline');
                    }));
                }
                else if (node.hasAttribute('__async')) {
                    let loadingIconPath = node.getAttribute('__async');
                    node.removeAttribute('__async');
                    if (!loadingIconPath) {
                        loadingIconPath = this.options.loadingIcon;
                    }
                    let p = this.resolve(loadingIconPath);
                    if (!p || !p.path) {
                        if (p) {
                            node.setAttribute('src', p.segment);
                        }
                        else {
                            node.setAttribute('src', loadingIconPath);
                        }
                        promises.push((async () => {
                            await assetDep.process();
                            node.setAttribute('data-src', await assetDep.getGeneratedUrl());
                        })());
                    }
                    else {
                        let assetIcon = this.resolveAsset(p.path, {
                            dynamic: true
                        }, ImageAsset_1.default);
                        promises.push((async () => {
                            await Promise.all([assetDep.process(), assetIcon.process()]);
                            let [src1, src2] = await Promise.all([assetIcon.getGeneratedUrl(), assetDep.getGeneratedUrl()]);
                            node.setAttribute('src', src1 + (p.segment ? '#' + p.segment : ''));
                            node.setAttribute('data-src', src2);
                        })());
                    }
                }
                else {
                    promises.push((async () => {
                        await assetDep.process();
                        let src = await assetDep.getGeneratedUrl();
                        node.setAttribute('src', src + (ret.segment ? '#' + ret.segment : ''));
                    })());
                }
            }
            if (node.hasAttribute('srcset')) {
                let srcset = node.getAttribute('srcset');
                if (srcset) {
                    let ps = [];
                    srcset.split(',')
                        .map(item => item.trim().split(/\s+/))
                        .forEach(([url, x]) => {
                        let ret = this.resolveNodePath(node, url);
                        if (ret && ret.path) {
                            let assetDep = this.resolveAsset(ret.path, {
                                dynamic: true
                            }, ImageAsset_1.default);
                            assetDep.isSingleFile = true;
                            ps.push((async () => {
                                await assetDep.process();
                                return [await assetDep.getGeneratedUrl(), x];
                            })());
                        }
                    });
                    promises.push(Promise.all(ps)
                        .then(items => {
                        var srcset = items.map(item => item.join(' ')).join(',');
                        node.setAttribute('srcset', srcset);
                    }));
                }
            }
            return;
        }
        else if (tag === 'use') {
            let ret = this.resolveNodePath(node, node.getAttribute('xlink:href'));
            if (ret && ret.path) {
                let assetDep = this.resolveAsset(ret.path, {
                    dynamic: true
                }, ImageAsset_1.default);
                promises.push((async () => {
                    await assetDep.process();
                    let src = await assetDep.getGeneratedUrl();
                    // @ts-ignore
                    node.setAttribute('xlink:href', src + (ret.segment ? '#' + reg.segment : ''));
                })());
            }
            return;
        }
        else if (tag === 'script') {
            if (!node.hasAttribute('type') || node.getAttribute('type') === 'text/javascript') {
                if (node.hasAttribute('src')) {
                    let ret = this.resolveNodePath(node, node.getAttribute('src'));
                    if (ret && ret.path) {
                        let isMain = node.hasAttribute('__main');
                        let dep = {
                            dynamic: true
                        };
                        if (node.hasAttribute('__inline') && this.options.minify) {
                            dep.included = true;
                        }
                        let assetDep = this.resolveAsset(ret.path, dep, JSAsset_1.default);
                        assetDep.isSingleFile = assetDep.isSingleFile || !dep.included;
                        let handle = async () => {
                            await assetDep.process();
                            if (dep.included) {
                                node.removeAttribute('__inline');
                                node.removeAttribute('src');
                                // @ts-ignore
                                node.text(assetDep.contents);
                            }
                            else {
                                node.setAttribute('src', await assetDep.getGeneratedUrl());
                            }
                        };
                        if (isMain) {
                            this.mainJSAsset = assetDep;
                            assetDep.depAst = ast;
                            this.mainJSHandler = (assets) => {
                                assetDep.extraAssets[this.name] = assets;
                                return handle();
                            };
                            node.removeAttribute('__main');
                        }
                        else {
                            promises.push(handle());
                        }
                    }
                }
                else {
                    let path = this.getInlineContentName('.js', node.textContent, node.source.filename);
                    let assetDep = this.resolveInlineAsset(path, JSInlineAsset_1.default, node.textContent);
                    assetDep.depAst = ast;
                    promises.push(assetDep.process().then(() => {
                        // @ts-ignore
                        node.text(assetDep.contents);
                    }));
                }
                return;
            }
        }
        else if (tag === 'link') {
            if (node.hasAttribute('href')) {
                let ret = this.resolveNodePath(node, node.getAttribute('href'));
                if (ret) {
                    let dep = {
                        dynamic: true
                    };
                    if (node.hasAttribute('__inline') && this.options.minify) {
                        dep.included = true;
                    }
                    let rel = node.getAttribute('rel');
                    if (rel) {
                        if (rel === 'stylesheet') {
                            let isMain = node.hasAttribute('__main');
                            let assetDep = this.resolveAsset(ret.path, dep, CSSAsset_1.default);
                            assetDep.isSingleFile = assetDep.isSingleFile || !dep.included;
                            let handle = async () => {
                                await assetDep.process();
                                if (dep.included) {
                                    node.removeAttribute('__inline');
                                    node.removeAttribute('href');
                                    node.removeAttribute('rel');
                                    node.name = 'style';
                                    // @ts-ignore
                                    node.text(assetDep.contents);
                                }
                                else {
                                    node.setAttribute('href', await assetDep.getGeneratedUrl());
                                }
                            };
                            if (isMain) {
                                this.mainCSSAsset = assetDep;
                                this.mainCSSHandler = assets => {
                                    assetDep.extraAssets[this.name] = new Set(assets);
                                    return handle();
                                };
                                node.removeAttribute('__main');
                            }
                            else {
                                promises.push(handle());
                            }
                        }
                        else if (rel.includes('icon')) {
                            let assetDep = this.resolveAsset(ret.path, dep, ImageAsset_1.default);
                            assetDep.isSingleFile = true;
                            promises.push((async () => {
                                await assetDep.process();
                                node.setAttribute('href', await assetDep.getGeneratedUrl());
                            })());
                        }
                    }
                }
            }
            return;
        }
        else if (tag === 'style') {
            let path = this.getInlineContentName('.css', node.textContent, node.source.filename);
            let assetDep = this.resolveInlineAsset(path, CSSInlineAsset_1.default, node.textContent);
            promises.push(assetDep.process().then(() => {
                // @ts-ignore
                node.text(assetDep.contents);
            }));
            return;
        }
        else {
            if (node.hasAttribute('style')) {
                let text = node.getAttribute('style');
                if (text) {
                    let path = this.getInlineContentName('.css', text, node.source.filename);
                    let assetDep = this.resolveInlineAsset(path, CSSInlineAsset_1.default, '.a{' + text + '}');
                    promises.push(assetDep.process().then(() => {
                        let css = assetDep.contents;
                        // @ts-ignore
                        node.setAttribute('style', /\.a\{([\w\W]*)\}/.exec(css)[1]);
                    }));
                }
            }
            if ((tag === 'video' || tag === 'audio' || tag === 'source' || tag === 'embed') && node.hasAttribute('src')) {
                let assetDep = this.resovleAssetWithExt(node.getAttribute('src'));
                assetDep.isSingleFile = true;
                promises.push((async () => {
                    await assetDep.process();
                    node.setAttribute('src', await assetDep.getGeneratedUrl());
                })());
            }
            if (tag === 'video' && node.hasAttribute('poster')) {
                let path = node.getAttribute('poster');
                if (path) {
                    let assetDep = this.resolveAsset(path, { dynamic: true }, ImageAsset_1.default);
                    assetDep.isSingleFile = true;
                    promises.push((async () => {
                        await assetDep.process();
                        node.setAttribute('poster', await assetDep.getGeneratedUrl());
                    })());
                }
            }
            if (node.childNodes.length > 0) {
                this.traverseNodes(node.children, ast, promises);
            }
        }
    }
    async handleCI(root, data, collectRes, collectedSlots = {}) {
        let promises = [];
        let mm = {};
        this.handleCITraverse(root.children, collectRes, mm, promises);
        Object.keys(mm).forEach(name => {
            let handlers = mm[name];
            let items = Array(handlers.length);
            let nodes = collectedSlots[name];
            if (nodes) {
                items[0] = nodes;
                for (let i = 1; i < handlers.length; i++) {
                    items[i] = nodes.map(node => node.clone());
                }
            }
            handlers.forEach((handler, i) => {
                promises.push(handler(items[i]));
            });
        });
        return Promise.all(promises);
    }
    handleCITraverse(nodes, collectRes, mm, promises) {
        nodes.forEach(node => {
            var tag = node.name;
            if (tag === 'slot') {
                node.name = 'template';
                let name;
                if (node.hasAttribute('name')) {
                    name = node.getAttribute('name');
                }
                else {
                    name = 'defaults';
                }
                let handler = async (nodes) => {
                    var promsies = [];
                    if (nodes) {
                        node.childNodes = nodes;
                        node.children.forEach(node => {
                            if (node.hasAttribute('slot-scope')) {
                                node.external.needRender = true;
                                render_static_1.renderData([node], {});
                            }
                        });
                    }
                    else {
                        this.handleCITraverse(node.children, collectRes, {}, promises);
                    }
                    return Promise.all(promises);
                };
                if (mm[name]) {
                    mm[name].push(handler);
                }
                else {
                    mm[name] = [handler];
                }
                return;
            }
            else if (tag === 'include') {
                let ret = this.resolve(node.getAttribute('src'));
                if (ret && ret.path) {
                    let assetDep = this.resolveAsset(ret.path, {
                        included: true,
                        dynamic: true
                    }, HTMLAsset);
                    promises.push(assetDep.processWithData(node.attributes.attrs, collectRes).then(root => {
                        // @ts-ignore
                        if (ret.segment) {
                            // @ts-ignore
                            let ele = root.getElementById(ret.segment);
                            if (ele) {
                                node.replaceWith(ele);
                            }
                        }
                        else {
                            node.replaceWith(root);
                        }
                    }));
                }
                return;
            }
            else if (tag.includes(':') || tag === 'component') {
                let name = tag.includes(':') ? tag : node.getAttribute('is');
                let assetDep = this.resolveInlineAsset(name, ComponentAsset_1.default);
                let jsExport = node.getAttribute('js-export');
                promises.push((async () => {
                    var promises = [assetDep.process()];
                    this.handleCITraverse(node.children, collectRes, mm, promises);
                    await Promise.all(promises);
                    let root = await assetDep.transformWithData(node.attributes.attrs, collectRes, node);
                    node.name = 'template';
                    if (root) {
                        node.childNodes = [root];
                    }
                    if (assetDep.mainAsset) {
                        this.addDependency(assetDep.mainAsset.name, {
                            included: true
                        });
                        this.addAsset(assetDep.mainAsset.name, assetDep.mainAsset);
                    }
                    collectRes.styles.push(...assetDep.cssAssets);
                    collectRes.scripts.push(...assetDep.jsAssets);
                    let first = collectRes.scripts[0];
                    if (jsExport && first) {
                        collectRes.scripts[0] = [first, jsExport];
                    }
                })());
                return;
            }
            let children = node.children;
            if (children.length > 0) {
                this.handleCITraverse(children, collectRes, mm, promises);
            }
        });
    }
    async transformWithData(data, collectRes, collectedSlots) {
        var root = this.ast.clone();
        render_static_1.renderData(root.childNodes, data);
        await this.handleCI(root, data, collectRes, collectedSlots);
        return root;
    }
    async processWithData(data, collectRes, collectedSlots) {
        await this.parseIfNeeded();
        var ast = await this.transformWithData(data, collectRes, collectedSlots);
        return ast;
    }
    transformToType(ast, type, data) {
        util_2.transform(type, ast, data);
    }
    render(ast) {
        return (this.options.minify ? util_1.renderMini : util_1.render)([ast]);
    }
}
exports.default = HTMLAsset;
