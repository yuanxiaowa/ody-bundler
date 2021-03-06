import { ElementNode, Node, RootNode } from "ody-html-tree/index";
import Asset from "../Asset";
import JSAsset from "../assets/JSAsset";
import CSSAsset from "../assets/CSSAsset";

export type KeyMap<T> = {
  [index: string]: T
}

export type Options = {
  watch: boolean
  outDir: string
  entry: string
  minify: boolean
  map: boolean
  env: string
  components: KeyMap<string>
  resolve: {
    alias: KeyMap<string>
  }
  loadingIcon: string
  publicURL: string
  dynamicDomain?: string
  regexs: KeyMap<RegExp>
  template: {
    type?: 'js' | 'vue' | 'ng' | 'php' | 'jstl'
    // 过滤器
    filters?: {
      [name: string]: string
    }
    onlyBody?: boolean
    // 获取数据地址
    getDevDataUrl?: (path: string) => (string | void)
    getDevDataTransformer?: (res: any) => any
    // 转换之前
    beforeTranspile?: (root: RootNode) => void
    // 获取静态数据
    getStaticData?: (path: string) => any
  }
  script: {
    getApiUrl?: (url: string) => string
    uglifyOptions?: {
      [name: string]: any
    }
    globals?: {
      [name: string]: string
    }
    global_defs?: {
      [name: string]: any
    }
  }
  style: {
    // postcss插件
    // https://www.postcss.parts/
    plugins?: any[]
    autoprefixer?: string[]
  }
  image: {
    // 图片压缩插件
    // https://www.npmjs.com/browse/keyword/imageminplugin
    imageminPlugins: {
      [type: string]: ((buf: Buffer) => Buffer)
    }
  }
  getOutputMask: (name: string, type: string) => (string | void)
  isUrlNeedResolve: (name: string) => boolean
  // 文件名是否需要根据内容hash
  hashContent: boolean
  deployer?: {
    // 是否保留本地副本
    keepLocal?: boolean
    handlers?: (
      (
        (name: string, type: string) => (string | void | (
          (path: string, content: any) => void)
        )
      )
      | string
    )[]
  }
  // 获取资源生成的地址
  getGeneratedUrl?: (asset: Asset) => Promise<string | void>
}

export type DepNormal = {
  name: string
  dynamic?: boolean
  included: boolean
}
export type DepInclude = {
  name: string
  namespace: string
  node: ElementNode
}
export type DepComponent = {
  name: string
  node: ElementNode
}
export type Dep = {
  [index: string]: any
  name: string
}

export type DepOpts = {
  [key in keyof Dep]?: Dep[key]
}

export type GeneratedResult = {
  [type: string]: string | Buffer
}

export type CollectedSlots = {
  [name: string]: Node[]
}

export type CollectRes = {
  styles: CSSAsset[],
  scripts: (JSAsset | [JSAsset, string])[]
}