"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("crypto");
function md5(text) {
    return crypto.createHash('md5')
        .update(text)
        .digest('hex');
}
exports.default = md5;
