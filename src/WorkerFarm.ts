// @ts-ignore
import * as Farm from 'worker-farm/lib/farm'
import Bundler from './Bundler';
import * as os from 'os'
import * as worker from './worker'
import { Dep, GeneratedResult } from './structs/index';

var opts = {
  autoStart: true,
  maxConcurrentWorkers: getNumWorkers()
}
var shared: WorkerFarm;
export default class WorkerFarm extends Farm {
  localWorker: any
  constructor(bundler: Bundler) {
    super(opts, require.resolve('./worker'))
    this.localWorker = worker
    this.init(bundler)
  }
  init(bundler: Bundler) {
    this.localWorker.init(bundler)
  }
  run(...args: any[]): Promise<{
    dependencies: Dep[],
    generated: GeneratedResult,
    hash: string
  }> {
    return this.localWorker.run(...args)
  }
  static getShared(bundler: Bundler) {
    if (!shared) {
      shared = new WorkerFarm(bundler)
    } else {
      shared.init(bundler)
    }
    return shared
  }
}

function getNumWorkers() {
  let cores;
  try {
    cores = require('physical-cpu-count');
  } catch (err) {
    cores = os.cpus().length;
  }
  return cores || 1;
}