"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const HTMLAsset_1 = require("./HTMLAsset");
const util_1 = require("ody-html-tree/util");
const md5_1 = require("../utils/md5");
function getDevUrl(url) {
    return new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.open('get', url);
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = reject;
        xhr.send();
    });
}
const devContainer = '<html><body><style>html,body,iframe{height:100%;margin:0;border:0}</style><iframe id="ifr"></iframe><script></script></body></html>';
function renderHtml(html) {
    var iframe = document.getElementById('ifr');
    iframe.contentDocument.write(html);
}
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
        let url = template.getDevDataUrl && template.getDevDataUrl(this.name);
        if (template.beforeTranspile) {
            template.beforeTranspile(ast);
        }
        if (url) {
            let dataName = '__data__';
            this.transformToType(ast, 'js', dataName);
            let func = `function(${dataName}){${this.render(ast)} return __html}`;
            let js = `(${getFuncStr(getDevUrl)})('${url}').then(${getFuncStr(template.getDevDataTransformer)}).then(${func}).then(${getFuncStr(renderHtml)})`;
            ast = this.parse(devContainer);
            let [script] = ast.getElementsByTagName('script');
            script.text(js);
        }
        else {
            if (template.type) {
                this.transformToType(ast, template.type);
            }
            if (template.onlyBody) {
                let [body] = util_1.getElementByTagName('body', ast);
                if (body) {
                    ast.childNodes = [body];
                }
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
