const fs = require("fs");
const Path = require("path");
const minimist = require("minimist");
const uglifyes = require("uglify-es");
const mkdirp = require("mkdirp");

const SRC_DIR = Path.join(__dirname, "src");

const ARGS = minimist(process.argv.slice(2));

const OUTPUT_DIR = ARGS.out || Path.join(__dirname, "dist");
const DEBUG = ARGS.debug;

let code = fs.readFileSync(Path.join(SRC_DIR, "pagequery.js"), "utf8");

mkdirp.sync(OUTPUT_DIR);

let compressSettings = {
  booleans: true,
  collapse_vars: true,
  comparisons: true,
  conditionals: true,
  dead_code: true,
  drop_console: !DEBUG,
  drop_debugger: !DEBUG,
  evaluate: true,
  hoist_funs: true,
  hoist_vars: false,
  if_return: true,
  join_vars: true,
  keep_fargs: false,
  keep_fnames: false,
  loops: true,
  negate_iife: true,
  properties: true,
  reduce_vars: true,
  sequences: true,
  unsafe: true,
  unused: true,
  // Return compressor warnings in result.warnings
  warnings: true,
};

let result = uglifyes.minify(code, {
  parse: {
    shebang: true,
    bare_returns: true,
  },
  warnings: false,
  mangle: true,
  compress: compressSettings,
});

fs.writeFileSync(Path.join(OUTPUT_DIR, "pagequery.js"), result.code);
