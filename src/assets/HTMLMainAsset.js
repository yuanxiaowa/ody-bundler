"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HTMLAsset_1 = require("./HTMLAsset");
const JSAsset_1 = require("./JSAsset");
const index_1 = require("ody-html-tree/index");
const util_1 = require("ody-html-tree/util");
const md5_1 = require("../utils/md5");
class HTMLMainAsset extends HTMLAsset_1.default {
    init() {
        super.init();
        this.isSingleFile = true;
    }
    async processAst(ast, collectRes) {
        if (this.mainJSAsset || this.mainCSSAsset) {
            if (this.mainJSAsset) {
                await this.mainJSHandler(collectRes.scripts);
            }
            if (this.mainCSSAsset) {
                await this.mainCSSHandler(collectRes.styles);
            }
        }
        let template = this.options.template;
        let url = template.getDataUrl && template.getDataUrl(this.name);
        if (url) {
            let initor = template.extraInitor;
            if (initor) {
                let [root] = util_1.getElementByTagName('body', ast);
                if (!root) {
                    root = ast;
                }
                let asset = this.resolveAsset(initor.liburl, {
                    dynamic: true
                }, JSAsset_1.default);
                asset.skipTransform = true;
                await asset.process();
                let elem = new index_1.ElementNode('div');
                let id = '__wrap__';
                elem.setAttribute('id', id);
                elem.style.add({
                    height: '100%',
                    display: 'none'
                });
                elem.setAttribute('v-show', '__loaded');
                elem.childNodes = root.childNodes;
                root.childNodes = [elem];
                let elem1 = new index_1.ElementNode('script', { src: await asset.getGeneratedUrl() });
                root.appendChild(elem1);
                let elem2 = new index_1.ElementNode('script');
                elem2.appendChild(new index_1.TextNode(`(${getFuncStr(initor.handler)})('${url}','${id}')`));
                root.appendChild(elem2);
            }
        }
        if (template.beforeTranspile) {
            template.beforeTranspile(ast);
        }
        if (template.type) {
            this.transformToType(ast, template.type);
        }
        if (template.onlyBody) {
            let [body] = util_1.getElementByTagName('body', ast);
            if (body) {
                ast.childNodes = [body];
            }
        }
        return ast;
    }
    async process() {
        if (!this.contents) {
            await super.process();
            var collectRes = {
                styles: [],
                scripts: []
            };
            var root = await this.processWithData(this.options.template.getStaticData(this.name), collectRes);
            await this.processResources(root);
            root = await this.processAst(root, collectRes);
            this.contents = this.render(root);
            this.hash = md5_1.default(this.contents);
        }
    }
}
exports.default = HTMLMainAsset;
function getFuncStr(func) {
    var str = func.toString();
    if (!/^(\(|function\b)/.test(str)) {
        str = 'function ' + str;
    }
    return str;
}
