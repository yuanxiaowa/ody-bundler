"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const JSAsset_1 = require("./JSAsset");
const util_1 = require("ody-transpiler/util");
class JSInlineAsset extends JSAsset_1.default {
    async transform() {
        await super.transform();
        let content = this.contents;
        content = content.replace(/__get\(\s*['"`]((\\.|.)*?)['"`]\s*\)/g, (_, name) => {
            return util_1.transformExpression(this.options.template.type, name);
        });
        this.contents = content;
    }
}
exports.default = JSInlineAsset;
