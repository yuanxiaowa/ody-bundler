import Asset from "../Asset";
import Bundler from "../Bundler";
import { GeneratedResult } from "../structs/index";

export default class ImageAsset extends Asset {
  contents: Buffer
  init() {
    super.init()
    this.encoding = null
    this.outDir = 'images'
  }
  async transform() {
    await super.transform()
    if (this.options.minify) {
      var plugin = this.options.image.imageminPlugins[this.type]
      if (plugin) {
        const imagemin = await import('imagemin')
        this.contents = await imagemin.buffer(this.contents, {
          plugins: [plugin]
        })
      }
    }
  }
  toString() {
    return `data:image/${this.type === 'svg' ? 'image/svg+xml' : this.type};${(<Buffer>this.contents).toString('base64')}`
  }
}