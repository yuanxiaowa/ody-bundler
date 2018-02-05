import JSAsset from "./JSAsset";

export default class JSInlineAsset extends JSAsset {
  async transform() {
    await super.transform()
    let content = this.contents
    content = content.replace(/__get\(\s*['"`]((\\.|.)*?)['"`]\s*\)/g, (_, name: string) => `{{${name}}}`)
    this.contents = content
  }
}