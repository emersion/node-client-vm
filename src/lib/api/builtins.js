// Default builtins
module.exports = require('browserify/lib/builtins');

// Add our custom ones
(function (exports) {
	exports.net = require.resolve('net-browserify');
	exports.tls = require.resolve('tls-browserify');
})(module.exports);