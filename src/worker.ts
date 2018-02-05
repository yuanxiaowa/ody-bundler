import Bundler from "./Bundler";

var bundler: Bundler
export function init(b: Bundler) {
  bundler = b
}
export async function run(path: string) {
  var asset = bundler.parser.getAsset(path)
  await asset.process()
  return {
    dependencies: Array.from(asset.dependencies.values()),
    contents: asset.contents,
    hash: asset.hash
  }
}