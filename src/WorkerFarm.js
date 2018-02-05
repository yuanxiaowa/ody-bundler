"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-ignore
const Farm = require("worker-farm/lib/farm");
const os = require("os");
const worker = require("./worker");
var opts = {
    autoStart: true,
    maxConcurrentWorkers: getNumWorkers()
};
var shared;
class WorkerFarm extends Farm {
    constructor(bundler) {
        super(opts, require.resolve('./worker'));
        this.localWorker = worker;
        this.init(bundler);
    }
    init(bundler) {
        this.localWorker.init(bundler);
    }
    run(...args) {
        return this.localWorker.run(...args);
    }
    static getShared(bundler) {
        if (!shared) {
            shared = new WorkerFarm(bundler);
        }
        else {
            shared.init(bundler);
        }
        return shared;
    }
}
exports.default = WorkerFarm;
function getNumWorkers() {
    let cores;
    try {
        cores = require('physical-cpu-count');
    }
    catch (err) {
        cores = os.cpus().length;
    }
    return cores || 1;
}
