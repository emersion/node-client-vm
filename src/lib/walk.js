var fs = require('fs');
var path = require('path');

var walk = function(dir, opts, done) {
	if (!done) { // opts is optionnal
		done = opts;
		opts = {};
	} else {
		opts = opts || {};
	}

	var results = [];
	fs.readdir(dir, function(err, list) {
		if (err) {
			return done(err);
		}
		var pending = list.length;
		if (!pending) {
			return done(null, results);
		}
		list.forEach(function(file) {
			file = path.join(dir, file);

			var fileDone = function () {
				if (!--pending) {
					done(null, results);
				}
			};

			fs.stat(file, function(err, stats) {
				if (stats && opts.each) {
					var result = opts.each(file, stats);

					if (result === false) {
						fileDone();
						return; // Stop here
					}
				}

				if (stats && stats.isDirectory()) {
					walk(file, function(err, res) {
						results = results.concat(res);
						fileDone();
					});
				} else {
					results.push(file);
					fileDone();
				}
			});
		});
	});
};

walk.read = function (dir, opts, done) {
	if (!done) { // opts is optionnal
		done = opts;
		opts = {};
	} else {
		opts = opts || {};
	}

	walk(dir, opts, function (err, list) {
		var files = {}, pending = list.length;
		if (!pending) {
			return done(null, files);
		}
		list.forEach(function (filepath, i) {
			fs.readFile(filepath, function (err, contents) {
				if (!err) {
					files[filepath] = contents.toString(); // contents is a Buffer
				}

				if (!--pending) {
					done(null, files);
				}
			});
		});
	});
};

exports = module.exports = walk;