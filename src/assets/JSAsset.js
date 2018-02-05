"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Asset_1 = require("../Asset");
const rollup = require("rollup");
const HTMLAsset_1 = require("./HTMLAsset");
const babel = require("babel-core");
const babel_core_1 = require("babel-core");
const noder_1 = require("ody-transpiler/libs/noder");
const source_map_1 = require("source-map");
const index_1 = require("ody-html-tree/index");
const uglifyJS = require("uglify-js");
const IMPORT_RE = /\b(?:import\b|export\b|require\s*\()/;
const GLOBAL_RE = /\b(?:process|__dirname|__filename|global|Buffer)\b/;
const FS_RE = /\breadFileSync\b/;
const MODULES_RE = /^[\w-]+(?=$|\/)/;
const URI_RE = /__uri\(\s*['`"](.*?)['`"]\s*\)/g;
const IMG_RE = /\.(png|jpe?g|gif|webp|bmp)$/;
async function getTemplateSerial(asset, segment) {
    var collectRes = {
        styles: [],
        scripts: []
    };
    var root;
    var ast = await asset.processWithData({}, collectRes);
    await asset.processResources(ast);
    if (segment) {
        let node = ast.getElementById(segment.substring(1));
        if (node) {
            root = new index_1.RootNode();
            root.appendChild(node);
        }
    }
    else {
        root = ast;
    }
    var dataName = '__data__';
    asset.transformToType(root, 'js', dataName);
    var ret = asset.render(root);
    return wrapTemplateWithFunction(ret, dataName);
}
function wrapTemplateWithFunction(str, dataName = '__data__') {
    return `function f(${dataName}){${str};return __html}`;
}
class JSAsset extends Asset_1.default {
    constructor() {
        super(...arguments);
        this.extraAssets = {};
    }
    init() {
        super.init();
        this.type = 'js';
        this.outDir = 'scripts';
    }
    mightHaveDependencies() {
        /* return (
          !/.js$/.test(this.name) ||
          IMPORT_RE.test(<string>this.contents) ||
          GLOBAL_RE.test(<string>this.contents)
        ); */
        return false;
    }
    async transform() {
        var rollupPlugin = {
            name: 'asset-plugin',
            load: async (id) => {
                var asset;
                if (id === this.name) {
                    asset = this;
                }
                else {
                    let dep = {};
                    let path = id;
                    let i = id.indexOf('#');
                    if (i > -1) {
                        path = id.substring(0, i);
                    }
                    if (IMG_RE.test(path)) {
                        dep.dynamic = true;
                    }
                    else {
                        dep.included = true;
                    }
                    asset = this.resovleAssetWithExt(path, dep);
                    asset.skipTransform = !asset.isSingleFile;
                }
                await asset.loadIfNeeded();
                return asset;
            },
            resolveId: (id, parent) => {
                if (!parent) {
                    return id;
                }
                if (/^[\w-]+(?=$|\/)/.test(id)) {
                    if (id.includes('/')) {
                        if (!/\.\w+$/.test(id)) {
                            id += '.js';
                        }
                    }
                    id = '~/' + id;
                }
                else {
                    if (!/\.\w+$/.test(id)) {
                        id += '.js';
                    }
                }
                let ret = this.resolve(id, parent);
                if (ret) {
                    return ret.path + (ret.segment ? '#' + ret.segment : '');
                }
            },
            transform: async (asset, id) => {
                var map = new source_map_1.SourceMapGenerator({
                    file: asset.name
                });
                var source;
                var segment = id.split('#')[1];
                if (id === this.name) {
                    let names = new Set();
                    let exportNameds;
                    let imports = '';
                    Object.keys(this.extraAssets).forEach(path => {
                        this.extraAssets[path].forEach(asset => {
                            if (Array.isArray(asset)) {
                                imports += `import ${asset[1]} from '${asset[0].name.replace(/\\/g, '/')}';`;
                            }
                            else {
                                names.add(asset.name);
                            }
                        });
                    });
                    imports += [...names].map(name => `import "${name.replace(/\\/g, '/')}";`).join('');
                    map.addMapping({
                        source: id,
                        generated: {
                            line: 1,
                            column: imports.length
                        },
                        original: {
                            line: 1,
                            column: 0
                        }
                    });
                    source = imports + source;
                }
                if (IMG_RE.test(asset.name)) {
                    await asset.process();
                    source = `export default var __url = ${asset.getGeneratedUrl('js')}` + (segment ? '#' + segment : '');
                }
                else if (asset.name.endsWith('html')) {
                    let func = await getTemplateSerial(asset, segment);
                    source = 'export default ' + func;
                }
                return {
                    code: source,
                    map: map.toString()
                };
            }
        };
        // @ts-ignore
        var bundle = await rollup.rollup({
            input: this.name,
            plugins: [rollupPlugin],
            experimentalDynamicImport: true,
            experimentalCodeSplitting: true,
            external: ['jquery']
        });
        var { code, map } = await bundle.generate({
            format: 'iife',
            sourcemap: this.options.map ? 'inline' : false,
            globals: this.options.script.globals
        });
        var ast = noder_1.parse(code, {
            sourceType: 'module',
            sourceFilename: this.name
        });
        if (ast) {
            var promises = [];
            babel.traverse(ast, {
                CallExpression: path => {
                    var node = path.node;
                    if (babel_core_1.types.isIdentifier(node.callee)) {
                        let name = node.callee.name;
                        let args = node.arguments.map(noder_1.getNodeString);
                        if (name === '__regex') {
                            let v = this.processRegex(args);
                            if (v) {
                                path.replaceWithSourceString(v);
                            }
                        }
                        else if (name === '__template') {
                            promises.push(this.processTemplate(args).then(v => {
                                if (v) {
                                    path.replaceWithSourceString(v);
                                }
                            }));
                        }
                        else if (name === '__api') {
                            promises.push(this.processApi(args).then(v => {
                                if (v) {
                                    path.replaceWithSourceString(v);
                                }
                            }));
                        }
                    }
                }
            });
            await Promise.all(promises);
            let result = babel.transformFromAst(ast, undefined, {
                filename: this.name,
                inputSourceMap: map
            });
            code = result.code;
            map = result.map;
        }
        let uglifyOptions = Object.assign({}, this.options.script.uglifyOptions);
        if (this.options.map) {
            uglifyOptions.inSourceMap = map.toUrl();
        }
        if (!uglifyOptions.compress.global_defs) {
            uglifyOptions.compress.global_defs = {};
        }
        Object.assign(uglifyOptions.compress.global_defs, {
            'process.env.NODE_ENV': this.options.env,
            NODE_ENV: this.options.env
        });
        let result = uglifyJS.minify(code, uglifyOptions);
        this.contents = result.code;
        if (this.options.map) {
            code += `\n//# sourceMappingURL=${map.toUrl()}`;
        }
    }
    processRegex([name, g]) {
        if (name) {
            name = name.slice(1, -1);
            if (name in this.options.regexs) {
                return this.options.regexs[name].toString() + (g ? g.slice(1, -1) : '');
            }
        }
    }
    async processTemplate([url, data]) {
        let asset;
        let func;
        url = url.slice(1, -1);
        if (url.startsWith('<')) {
            let path = this.getInlineContentName('html', url);
            asset = this.resolveInlineAsset(path, HTMLAsset_1.default, url);
            func = await getTemplateSerial(asset);
        }
        else if (url.startsWith('#') && this.depAst) {
            let node = this.depAst.getElementById(url.substring(1));
            if (node) {
                let root = new index_1.RootNode();
                root.appendChild(node.clone());
                let dataName = '__data__';
                HTMLAsset_1.default.prototype.transformToType.call(this, root, 'js', dataName);
                func = wrapTemplateWithFunction(HTMLAsset_1.default.prototype.render.call(this, root), dataName);
            }
        }
        if (func) {
            return `(${func})(${data})`;
        }
    }
    async processApi([str]) {
        if (str) {
            return `'${this.options.script.getApiUrl(str.slice(1, -1))}'`;
        }
    }
}
exports.default = JSAsset;
