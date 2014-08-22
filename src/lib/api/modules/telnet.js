var net = require('net');

exports.connect = function (opts, cb) {
	cb = cb || function () {};

	var stream = net.connect(opts, function () {
		stream.setEncoding('utf8');
		cb(stream);
	});
	return stream;
};