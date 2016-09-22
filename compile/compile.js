var args = process.argv.slice(2),
	dest = args.find(arg => /^\-o=.+$/.test(arg)),
	debug = args.some(arg => /^debug$/.test(arg));

dest = dest ? dest.slice(3) : '.';

require('zcompile')({
	src: '.',
	dst: dest,

	files: [ 'zQuery.js' ],
	debug: debug,
});