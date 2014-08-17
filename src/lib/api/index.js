var fs = require('fs');
var path = require('path');
var express = require('express');
var Q = require('q');
var walk = require('../walk');

var loadModulePath = function (modulePath) {
	var moduleName = path.basename(modulePath),
		packagePath = path.join(modulePath, 'package.json');

	var mod = {};
	mod.id = moduleName;
	return Q.denodeify(fs.readFile)(packagePath).then(function (json) { // Read package.json
		var pkg = null;
		try {
			pkg = JSON.parse(json);
		} catch (err) {
			res.status(500).send({
				error: 'Cannot load module '+moduleName+' (invalid package.json: '+err+')'
			});
			return;
		}
		mod.package = pkg;
	}, function (err) {
		throw {
			code: 500,
			error: 'Cannot load module '+moduleName+' (cannot read package.json: '+err+')'
		};
	}).then(function () { // Get module contents
		return Q.denodeify(walk.read)(modulePath, {
			each: function (file, stats) {
				// Ignore submodules
				if (file == path.join(modulePath, 'node_modules')) {
					return false;
				}

				// Ignore package.json
				if (file == packagePath) {
					return false;
				}

				// Only keep *.js and *.json
				if (!stats.isDirectory() && !~['.js', '.json'].indexOf(path.extname(file))) {
					return false;
				}
			}
		}).then(function (files) {
			mod.files = {};
			for (var filepath in files) {
				var pathname = path.relative(modulePath, filepath);
				mod.files[pathname] = files[filepath];
			}
		}, function (err) {
			throw {
				code: 500,
				error: 'Cannot load module '+moduleName+' (cannot read module contents: '+err+')'
			};
		});
	}).then(function () { // Load submodules
		if (mod.package.dependencies) {
			var deps = [],
				depsNames = Object.keys(mod.package.dependencies),
				pending = depsNames.length,
				promises = [];

			depsNames.forEach(function (name) {
				// TODO: circular dependencies support
				var promise = loadModulePath(path.join(modulePath, 'node_modules', name)).then(function (submod) {
					deps.push(submod);
				});

				promises.push(promise);
			});
			
			return Q.all(promises).then(function () {
				mod.dependencies = deps;
			});
		}
	}).then(function () {
		return mod;
	});
};

var loadModule = function (moduleName) {
	// Try to resolve the module name
	// Does not work if the main file is in a subfolder
	/*var mainPath;
	try {
		mainPath = require.resolve(moduleName);
	} catch (err) {
		return Q.reject({
			code: 404,
			error: 'Cannot find module '+moduleName
		});
	}
	var modulePath = path.dirname(mainPath);*/

	var modulePath = path.join(__dirname, '..', '..', '..', 'node_modules', moduleName);
	return loadModulePath(modulePath);
};

module.exports = function (server) {
	var app = express();

	// Loader
	app.get('/load/:module', function (req, res) {
		var moduleName = req.param('module');

		loadModule(moduleName).then(function (mod) {
			res.send(mod);
		}, function (err) {
			if (err instanceof Error) {
				throw err;
			}

			if (err.code) {
				res.status(err.code);
			}
			res.send(err);
		});
	});

	// Core modules
	app.get('/core', function (req, res) {
		var coreModulesNames = ['buffer', 'crypto-browserify', 'node-forge'];
		var core = {};

		core.libs = {};
		var importLibs = function (dirname) {
			return Q.denodeify(walk.read)(dirname, {
				each: function (filepath) {
					var basename = path.basename(filepath, '.js');

					if (core.libs[basename]) {
						return false;
					}

					//TODO: filter core modules, remove unused ones
				}
			}).then(function (files) {
				for (var filepath in files) {
					var basename = path.basename(filepath, '.js');
					core.libs[basename] = files[filepath];
				}
			}, function (err) {
				throw {
					code: 500,
					error: String(err)
				};
			})
		};

		importLibs(path.join(__dirname, '..', 'core-vm')).then(function () {
			return importLibs(path.join(__dirname, '..', 'core'));
		}).then(function () {
			var promises = [];

			core.modules = {};
			var loadCoreModule = function (moduleName) {
				return loadModule(moduleName).then(function (mod) {
					core.modules[moduleName.replace('-browserify', '')] = mod;
				});
			};
			for (var i = 0; i < coreModulesNames.length; i++) {
				promises.push(loadCoreModule(coreModulesNames[i]));
			}

			return Q.all(promises);
		}).then(function () {
			res.send(core);
		}, function (err) {
			if (err.code) {
				res.status(err.code);
			}
			res.send(err);
		});
	});

	app.post('/core/dns/lookup', function (req, res) {
		var dns = require('dns');

		var args = req.body;
		args.push(function () {
			var args = Array.prototype.slice.call(arguments);
			res.send(args);
		});

		dns.lookup.apply(dns, args);
	});

	// Wrappers
	app.use('/wrap', require('./wrap')(server));

	return app;
};