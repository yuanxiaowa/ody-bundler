"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Path = require("path");
class Resolver {
    constructor(bundler) {
        this.bundler = bundler;
    }
    resolve(name, parent) {
        if (parent) {
            return Path.resolve(Path.dirname(parent), name);
        }
        return Path.resolve(name);
    }
}
exports.default = Resolver;
