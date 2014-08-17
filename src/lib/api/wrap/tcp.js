var express = require('express');
var expressWs = require('express-ws');

module.exports = function (server) {
	var app = express();

	var handles = {};
	app.post('/connect', function (req, res) {
		var TCP = process.binding('tcp_wrap').TCP;

		var handle = new TCP();

		var connectReq = handle.connect.apply(handle, req.body);
		connectReq.oncomplete = function (status, handle, req, readable, writable) {
			//TODO: generate a token
			handles[handle.fd] = handle;

			var args = Array.prototype.slice.call(arguments);
			res.send(args);
		};
	});

	var wss = expressWs(app, server);

	app.ws('/api/vm/wrap/tcp/socket', function (socket, req) {
console.log('connection!');

		var fd = parseInt(req.query.fd, 10);

		if (!handles[fd]) {
			/*socket.send(JSON.stringify({
				code: 404,
				error: 'Unknown TCP connection "'+fd+'"'
			}));*/
console.log('Unknown TCP connection "'+fd+'"');
			socket.close();
			return;
		}

		var handle = handles[fd];
		//delete handles[fd];

		socket.on('message', function (data) {
			var req;
			if (Buffer.isBuffer(data)) {
				req = handle.writeBuffer(data);
			} else {
				req = handle.writeUtf8String(data);
			}

			req.oncomplete = function () {
				console.log('Sent data ('+data.length+')', data);
			};
		});
		handle.onread = function (buffer, offset, length) {
			var end = offset + length;

			if (buffer) {
console.log('Received ('+length+'): ', buffer.slice(offset, end));
				socket.send(buffer.slice(offset, end));
			} else if (process._errno == 'EOF') {
				socket.close();
			} else { // Error
				//TODO
			}
		};
		socket.on('close', function () {
			handle.close();
			console.log('TCP connection closed');
		});
console.log(handle.constructor.prototype);
		handle.readStart();
	});

	return app;
};