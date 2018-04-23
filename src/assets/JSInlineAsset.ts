import JSAsset from "./JSAsset";

export default class JSInlineAsset extends JSAsset {
  imgType = 'html'
  onlyVars = false
  async transform() {
    var content
    if (this.onlyVars) {
      content = this.originalCode
      if (this.options.minify) {
        let ret = this.minify(content)
        content = ret.code
      }
    } else {
      await super.transform()
      content = this.contents
    }
    content = content.replace(/__get\(\s*['"`]((\\.|.)*?)['"`]\s*\)/g, (_, name: string) => `{{${name}}}`)
    this.contents = content
  }
}