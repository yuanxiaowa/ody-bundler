"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("crypto");
function objectHash(obj) {
    var hash = crypto.createHash('md5');
    for (let key of Object.keys(obj).sort()) {
        hash.update(key + obj[key]);
    }
    return hash.digest('hex');
}
exports.default = objectHash;
