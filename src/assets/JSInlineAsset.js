"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const JSAsset_1 = require("./JSAsset");
class JSInlineAsset extends JSAsset_1.default {
    async transform() {
        await super.transform();
        let content = this.contents;
        content = content.replace(/__get\(\s*['"`]((\\.|.)*?)['"`]\s*\)/g, (_, name) => `{{${name}}}`);
        this.contents = content;
    }
}
exports.default = JSInlineAsset;
