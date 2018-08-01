const fs = require("fs");
const Path = require("path");
const minimist = require("minimist");

const SRC_DIR = Path.join(__dirname, "src");

const ARGS = minimist(process.argv.slice(2));

const OUTPUT_DIR = ARGS.out || Path.join(__dirname, "dist");
const DEBUG = ARGS.debug;

require("zcompile")({
  src: SRC_DIR,
  dst: OUTPUT_DIR,

  files: fs.readdirSync(SRC_DIR),
  debug: DEBUG,
});
