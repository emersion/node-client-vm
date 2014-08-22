var fs = require('fs');
var path = require('path');
var express = require('express');
var Q = require('q');
var browserify = require('browserify');

var config = require('../../config');
var cacheDirPath = path.join(__dirname, '..', '..', 'cache');

// Enabled modules
// TODO: store this in config
var modules = {
	'smtp': require.resolve('smtp-protocol'),
	'imap': require.resolve('imap'),
	'telnet': require.resolve('./modules/telnet'),
};

/**
 * @see https://stackoverflow.com/questions/21194934/node-how-to-create-a-directory-if-doesnt-exist
 */
function ensureDirExists(path, mask, cb) {
	if (typeof mask == 'function') { // allow the `mask` parameter to be optional
		cb = mask;
		mask = 0777;
	}

	fs.mkdir(path, mask, function(err) {
		if (err) {
			if (err.code == 'EEXIST') cb(null); // ignore the error if the folder already exists
			else cb(err); // something else went wrong
		} else cb(null); // successfully created folder
	});
}

function generateModule(moduleName, modulePath) {
	return browserify({
		builtins: require('./builtins'),
		standalone: moduleName,
		debug: false // True to add a sourceMappingURL - can produce huge files!
	})
	.add(modulePath, { entry: true })
	.bundle()
	.on('error', function (err) { console.error(err); });
}

function getModule(moduleName, modulePath, cb) {
	if (!config.cache) { // Cache disabled
		process.nextTick(function () {
			cb(generateModule(moduleName, modulePath));
		});
		return;
	}

	var cachePath = path.join(cacheDirPath, moduleName+'.js');

	// Make sure the cache dir exists
	ensureDirExists(cacheDirPath, function (err) {
		if (err) {
			cb(err);
			return;
		}

		// Is this module cached?
		fs.exists(cachePath, function (exists) {
			var bundle;
			if (exists) { // If the module is cached, use it
				bundle = fs.createReadStream(cachePath);
			} else { // Otherwise, generate it
				bundle = generateModule(moduleName, modulePath);
			}

			cb(bundle);

			if (!exists) { // If the file is not cached, let's cache it
				var cacheStream = fs.createWriteStream(cachePath);
				bundle.pipe(cacheStream);
			}
		});
	});
}

module.exports = function (server) {
	var app = express();

	// Loader
	app.get('/load/:module', function (req, res) {
		var moduleName = req.param('module'),
			modulePath = modules[moduleName];

		if (!modulePath) {
			res.status(404).send('Cannot find module '+moduleName);
			return;
		}

		res.type('application/javascript');

		getModule(moduleName, modulePath, function (bundle) {
			bundle.pipe(res)
		});
	});

	// Core modules
	app.use('/net', require('./net')(server));

	return app;
};