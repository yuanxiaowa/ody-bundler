import JSAsset from "./JSAsset";
import { transformExpression } from "ody-transpiler/util";

export default class JSInlineAsset extends JSAsset {
  async transform() {
    await super.transform()
    let content = this.contents
    content = content.replace(/__get\(\s*['"`]((\\.|.)*?)['"`]\s*\)/g, (_, name: string) => {
      return <string>transformExpression(this.options.template.type, name)
    })
    this.contents = content
  }
}