"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Logger {
    constructor(options) { }
    clear() { }
    status(icon, text, color) {
        console.log(`【${new Date().toLocaleTimeString()}】`, text);
    }
    error(text) {
        console.error(text);
    }
    log(msg) {
        console.log(msg);
    }
}
exports.default = Logger;
