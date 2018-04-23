"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Asset_1 = require("../Asset");
class RawAsset extends Asset_1.default {
    init() {
        super.init();
        this.outDir = 'assets';
        this.encoding = null;
    }
}
exports.default = RawAsset;
