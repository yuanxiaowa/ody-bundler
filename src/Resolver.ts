import { Options } from "./structs/index";
import Bundler from "./Bundler";
import  * as Path from 'path'

export default class Resolver {
  constructor(public bundler: Bundler) {

  }
  resolve(name: string, parent?: string) {
    if (parent) {
      return Path.resolve(Path.dirname(parent), name)
    }
    return Path.resolve(name);
  }
}