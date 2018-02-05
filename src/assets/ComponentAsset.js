"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Asset_1 = require("../Asset");
const glob = require("glob");
const Path = require("path");
const HTMLAsset_1 = require("./HTMLAsset");
const JSAsset_1 = require("./JSAsset");
const CSSAsset_1 = require("./CSSAsset");
const fs_extra_1 = require("fs-extra");
const md5_1 = require("../utils/md5");
class ComponentAsset extends Asset_1.default {
    constructor() {
        super(...arguments);
        this.cssAssets = new Set();
        this.jsAssets = new Set();
    }
    init() {
        this.type = 'component';
        var items = this.name.split(':');
        this.componentName = items[1];
        this.namespace = items[0];
        this.name = Path.resolve(this.options.components[this.namespace], this.componentName, '*');
    }
    load() {
        var dir = Path.dirname(this.name);
        return new Promise((resolve, reject) => {
            glob(this.name, {
                // absolute: true,
                nodir: true
            }, (err, matches) => {
                if (err) {
                    return reject(err);
                }
                matches = matches.map(name => Path.basename(name));
                var ret = {};
                if (matches.includes('setting.js') || matches.includes('setting.json')) {
                    ret = fs_extra_1.readFileSync(dir + '/setting');
                }
                else {
                    if (matches.includes('index.html')) {
                        ret.index = 'index.html';
                    }
                    else if (matches.includes(this.componentName + '.html')) {
                        ret.index = this.componentName + '.html';
                    }
                    ret.styles = [];
                    if (matches.includes('index.css')) {
                        ret.styles.push('index.css');
                    }
                    else if (matches.includes(this.componentName + '.css')) {
                        ret.styles.push(this.componentName + '.css');
                    }
                    ret.scripts = [];
                    if (matches.includes('index.js')) {
                        ret.scripts.push('index.js');
                    }
                    else if (matches.includes(this.componentName + '.js')) {
                        ret.scripts.push(this.componentName + '.js');
                    }
                }
                resolve(ret);
            });
        });
    }
    collectDependencies() {
        var { index, scripts, styles } = this.contents;
        var ret = this.resolve(index);
        if (ret) {
            this.mainAsset = this.resolveAsset(ret.path, {
                dynamic: true
            }, HTMLAsset_1.default);
        }
        var jsAssets = scripts.map(url => {
            var ret = this.resolve(url);
            if (ret) {
                return this.resolveAsset(ret.path, {
                    dynamic: true
                }, JSAsset_1.default);
            }
        }).filter(Boolean);
        this.jsAssets = new Set(jsAssets);
        var cssAssets = styles.map(url => {
            var ret = this.resolve(url);
            if (ret) {
                return this.resolveAsset(ret.path, {
                    dynamic: true
                }, CSSAsset_1.default);
            }
        }).filter(Boolean);
        this.cssAssets = new Set(cssAssets);
    }
    generateBundleName() {
        return md5_1.default(this.name);
    }
    async transformWithData(data, collectRes, node) {
        if (this.mainAsset) {
            let slotCols = {
                defaults: []
            };
            collectSlots(node.childNodes, slotCols);
            let root = await this.mainAsset.processWithData(data, collectRes, slotCols);
            let elem = root.children[0];
            if (elem) {
                if (data.class) {
                    elem.classList.add(...data.class.split(/\s+/));
                }
                if (data.style) {
                    elem.style.addString(data.style);
                }
                if (data.id) {
                    elem.setAttribute('id', data.id);
                }
            }
            return root;
        }
    }
}
exports.default = ComponentAsset;
function collectSlots(nodes, ret) {
    nodes.forEach(node => {
        if (node.isElement()) {
            if (node.hasAttribute('slot')) {
                let name = node.getAttribute('slot');
                node.removeAttribute('slot');
                if (name in ret) {
                    ret[name].push(node);
                }
                else {
                    ret[name] = [node];
                }
                return;
            }
        }
        ret.defaults.push(node);
    });
}
