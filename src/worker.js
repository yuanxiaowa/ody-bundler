"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var bundler;
function init(b) {
    bundler = b;
}
exports.init = init;
async function run(path) {
    var asset = bundler.parser.getAsset(path);
    await asset.process();
    return {
        dependencies: Array.from(asset.dependencies.values()),
        contents: asset.contents,
        hash: asset.hash
    };
}
exports.run = run;
