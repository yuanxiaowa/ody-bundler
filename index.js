"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Bundler_1 = require("./src/Bundler");
const ramda = require("ramda");
var defaultOptions = {
    watch: false,
    outDir: 'dist',
    minify: false,
    map: false,
    hashContent: false,
    env: 'development',
    resolve: {
        alias: {}
    },
    entry: '**/*.html',
    components: {},
    loadingIcon: '',
    publicURL: '/',
    isUrlNeedResolve: () => false,
    regexs: {
        mobile: /^0?1\d{10}$/,
        email: /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
        url: /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})).?)(?::\d{2,5})?(?:[/?#]\S*)?$/i,
        number: /^(?:-?\d+|-?\d{1,3}(?:,\d{3})+)?(?:\.\d+)?$/,
        digits: /^\d+$/
    },
    template: {
        type: 'js',
        filters: {},
        getStaticData(path) {
            return {};
        }
    },
    script: {
        // api
        getApiUrl(url) {
            return url;
        },
        globals: {},
        uglifyOptions: {
            compress: {
                global_defs: {}
            }
        }
    },
    getOutputMask(name, type) {
    },
    style: {
        plugins: []
    },
    image: {
        imageminPlugins: {}
    },
    envs: {
        development: {
            watch: true,
            map: true,
            template: {
                getDevDataTransformer(res) {
                    var data = JSON.parse(res);
                    if (data.code === 1) {
                        return data.data;
                    }
                    throw data;
                }
            },
            hashContent: false,
            script: {
                uglifyOptions: {
                    output: {
                        beautify: true
                    }
                }
            }
        },
        production: {
            minify: true,
            hashContent: true,
            script: {
                uglifyOptions: {
                    compress: {
                        drop_console: true
                    }
                }
            }
        }
    }
};
function mergeOptions(src, dst) {
    return ramda.mergeDeepRight(src, dst);
}
exports.mergeOptions = mergeOptions;
function bundle(options) {
    let opts = ramda.mergeDeepRight(defaultOptions, options);
    let env = process.env.NODE_ENV || opts.env;
    if (opts.envs) {
        let envs = opts.envs;
        delete opts.envs;
        if (envs[env]) {
            opts = ramda.mergeDeepRight(opts, envs[env]);
        }
    }
    var bundler = new Bundler_1.default(opts);
    return bundler.bundle();
}
exports.default = bundle;
