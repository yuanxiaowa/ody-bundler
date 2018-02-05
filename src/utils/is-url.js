"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Path = require("path");
// Matches scheme (ie: tel:, mailto:, data:)
const SCHEME_REGEXP = /^[a-z]*\:/i;
function isUrl(url) {
    return !Path.isAbsolute(url) && SCHEME_REGEXP.test(url);
}
exports.default = isUrl;
