"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Path = require("path");
const RawAsset_1 = require("./assets/RawAsset");
class Parser {
    constructor(bundler) {
        this.bundler = bundler;
        this.extensions = {};
        this.registerExtension('js', './assets/JSAsset');
        this.registerExtension('css', './assets/CSSAsset');
        this.registerExtension('html', './assets/HTMLAsset');
        this.registerExtension('png', './assets/ImageAsset');
        this.registerExtension('gif', './assets/ImageAsset');
        this.registerExtension('ico', './assets/ImageAsset');
        this.registerExtension('jpg', './assets/ImageAsset');
        this.registerExtension('webp', './assets/ImageAsset');
        this.registerExtension('svg', './assets/ImageAsset');
    }
    registerExtension(ext, parser) {
        if (!ext.startsWith('.')) {
            ext = '.' + ext;
        }
        this.extensions[ext] = parser;
    }
    findParser(filename) {
        let extension = Path.extname(filename);
        let parser = this.extensions[extension] || RawAsset_1.default;
        if (typeof parser === 'string') {
            parser = this.extensions[extension] = require(parser).default;
        }
        return parser;
    }
    getAsset(filename) {
        let AssetConstructor = this.findParser(filename);
        // options.parser = this;
        return new AssetConstructor(filename, this.bundler);
    }
}
exports.default = Parser;
