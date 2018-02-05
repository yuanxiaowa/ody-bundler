import { Options} from "./structs/index";
import Asset from "./Asset";
import Bundler from "./Bundler";
import * as Path from 'path'
import RawAsset from "./assets/RawAsset";
import ComponentAsset from "./assets/ComponentAsset";
import HTMLMainAsset from "./assets/HTMLMainAsset";

export default class Parser {
  extensions: {
    [ext: string]: typeof Asset | string
  } = {}
  constructor(public bundler: Bundler) {
    this.registerExtension('js', './assets/JSAsset');
    this.registerExtension('css', './assets/CSSAsset');
    this.registerExtension('html', './assets/HTMLAsset');

    this.registerExtension('png', './assets/ImageAsset');
    this.registerExtension('gif', './assets/ImageAsset');
    this.registerExtension('ico', './assets/ImageAsset');
    this.registerExtension('jpg', './assets/ImageAsset');
    this.registerExtension('webp', './assets/ImageAsset');
    this.registerExtension('svg', './assets/ImageAsset');
  }
  registerExtension(ext: string, parser: string) {
    if (!ext.startsWith('.')) {
      ext = '.' + ext;
    }
    this.extensions[ext] = parser;
  }
  findParser(filename: string) {
    let extension = Path.extname(filename);
    let parser = this.extensions[extension] || RawAsset;
    if (typeof parser === 'string') {
      parser = this.extensions[extension] = require(parser).default;
    }
    return <typeof Asset>parser;
  }
  getAsset(filename: string) {
    let AssetConstructor: typeof Asset = this.findParser(filename);
    // options.parser = this;
    return new AssetConstructor(filename, this.bundler);
  }
}