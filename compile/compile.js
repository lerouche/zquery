const fs = require('fs'),
	  UglifyJS = require('uglify-js'),

	  SRC = '../src/zQuery.js',
	  DST = 'zQuery.js';

var code = fs.readFileSync(SRC, { encoding: 'utf8' });

var ast = UglifyJS.parse(code);

ast.figure_out_scope();
var compressor = UglifyJS.Compressor({
	drop_console: !~process.argv.indexOf('debug'),
	unsafe: true,
});
ast = ast.transform(compressor);

ast.figure_out_scope();
ast.compute_char_frequency();
ast.mangle_names();

code = ast.print_to_string();

fs.writeFileSync(DST, code);
