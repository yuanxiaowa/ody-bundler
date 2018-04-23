"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const JSAsset_1 = require("./JSAsset");
class JSInlineAsset extends JSAsset_1.default {
    constructor() {
        super(...arguments);
        this.imgType = 'html';
        this.onlyVars = false;
    }
    async transform() {
        var content;
        if (this.onlyVars) {
            content = this.originalCode;
            if (this.options.minify) {
                let ret = this.minify(content);
                content = ret.code;
            }
        }
        else {
            await super.transform();
            content = this.contents;
        }
        content = content.replace(/__get\(\s*['"`]((\\.|.)*?)['"`]\s*\)/g, (_, name) => `{{${name}}}`);
        this.contents = content;
    }
}
exports.default = JSInlineAsset;
