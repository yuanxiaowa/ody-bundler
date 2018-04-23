import Asset from "../Asset";

export default class RawAsset extends Asset {
  init() {
    super.init()
    this.outDir = 'assets'
    this.encoding = null
  }
}