var express = require('express');
var expressWs = require('express-ws');
var crypto = require('crypto');

function generateToken() {
	return crypto.randomBytes(32).toString('hex');
}

module.exports = function (server) {
	var app = express();

	var handles = {};

	app.post('/connect', function (req, res) {
		var TCP = process.binding('tcp_wrap').TCP;

		var handle = new TCP();

		var connectReq = handle.connect.apply(handle, req.body);

		if (!connectReq) {
			res.status(500).send({
				code: 500,
				error: 'Cannot connect to server'
			});
			return;
		}

		connectReq.oncomplete = function (status, handle, req, readable, writable) {
			// Generate a token for this connection
			var token = generateToken();

			if (status == 0) {
				handles[token] = handle;
			}

			var args = Array.prototype.slice.call(arguments);

			// Change handle, do not send fd, send the token
			args[1] = { token: token };

			res.send(args);
		};
	});

	var wss = expressWs(app, server);

	app.ws('/api/vm/wrap/tcp/socket', function (socket, req) {
		var token = req.query.token;

		if (!handles[token]) {
			console.warn('Unknown TCP connection with token "'+token+'"');
			socket.close();
			return;
		}

		var handle = handles[token];
		//delete handles[fd];

		console.log('Forwarding socket with token '+token);

		socket.on('message', function (data) {
			var req;
			if (Buffer.isBuffer(data)) {
				req = handle.writeBuffer(data);
			} else {
				req = handle.writeUtf8String(data);
			}

			req.oncomplete = function () {
				//console.log('Sent ('+data.length+')', data.toString());
			};
		});
		handle.onread = function (buffer, offset, length) {
			var end = offset + length;

			if (buffer) {
				//console.log('Received ('+length+'): ', buffer.slice(offset, end).toString());
				socket.send(buffer.slice(offset, end));
			} else if (process._errno == 'EOF') {
				socket.close();
			} else { // Error
				//TODO
			}
		};
		socket.on('close', function () {
			handle.close();
			console.log('Websocket connection closed ('+token+')');
		});

		handle.readStart();
	});

	return app;
};