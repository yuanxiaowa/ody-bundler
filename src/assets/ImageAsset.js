"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Asset_1 = require("../Asset");
class ImageAsset extends Asset_1.default {
    init() {
        super.init();
        this.encoding = null;
        this.outDir = 'images';
    }
    async transform() {
        await super.transform();
        if (this.options.minify) {
            var plugin = this.options.image.imageminPlugins[this.type];
            if (plugin) {
                const imagemin = await Promise.resolve().then(() => require('imagemin'));
                this.contents = await imagemin.buffer(this.contents, {
                    plugins: [plugin]
                });
            }
        }
    }
    toString() {
        return `data:image/${this.type === 'svg' ? 'image/svg+xml' : this.type};${this.contents.toString('base64')}`;
    }
}
exports.default = ImageAsset;
