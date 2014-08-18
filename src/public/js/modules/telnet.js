var net = require('net');

exports.connect = function (host, port, cb) {
	cb = cb || function () {};

	var stream = net.connect({
		host: host,
		port: port
	}, function () {
		stream.setEncoding('utf8');
		cb(stream);
	});
	return stream;
};