"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request-promise-native");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
function sendToNetwork(url, path, content) {
    return request.post(url, {
        formData: {
            [path]: content
        }
    });
}
exports.sendToNetwork = sendToNetwork;
async function sendToLocal(dir, path, content) {
    var filename = path_1.join(dir, path);
    await fs_extra_1.ensureDir(path_1.dirname(filename));
    return fs_extra_1.writeFile(filename, content);
}
exports.sendToLocal = sendToLocal;
