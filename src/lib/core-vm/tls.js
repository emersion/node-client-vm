var net = require('net');
var Stream = require('stream');
var forge = require('node-forge');

exports.connect = function (options, callback) {
	options = options || {};
	callback = callback || function () {};

	if (!options.socket) {
		throw new Error('tls.connect() without providing a socket is not supported for the moment');
	}

	// Create a new socket so as to prevent old socket listeners to catch encrypted data
	// TODO: implement TLSSocket
	var socket = new net.Socket({
		handle: options.socket._handle
	});
	socket.encrypted = true;

	var cleartextStream = new Stream;
	cleartextStream.readable = true;

	var client = forge.tls.createConnection({
		server: false,
		verify: function(connection, verified, depth, certs) {
			if (!options.rejectUnauthorized || !options.servername) {
				console.log('[tls] server certificate verification skipped');
				return true;
			}

			console.log('[tls] skipping certificate trust verification');
			verified = true;

			if (depth === 0) {
				var cn = certs[0].subject.getField('CN').value;
				if (cn !== options.servername) {
					verified = {
						alert: forge.tls.Alert.Description.bad_certificate,
						message: 'Certificate common name does not match hostname.'
					};
					console.warn('[tls] '+cn+' !== '+options.servername);
				}
				console.log('[tls] server certificate verified');
			}

			return verified;
		},
		connected: function(connection) {
			console.log('[tls] connected');
			// prepare some data to send (note that the string is interpreted as
			// 'binary' encoded, which works for HTTP which only uses ASCII, use
			// forge.util.encodeUtf8(str) otherwise
			//client.prepare('GET / HTTP/1.0\r\n\r\n');

			cleartextStream.writable = true;
			cleartextStream.write = function (data) {
				console.log('[tls] sending: ' + data.toString('utf8'));
				client.prepare(data.toString('binary'));
			};

			callback();
		},
		tlsDataReady: function(connection) {
			// encrypted data is ready to be sent to the server
			var data = connection.tlsData.getBytes();
			socket.write(data, 'binary'); // encoding should be 'binary'
		},
		dataReady: function(connection) {
			// clear data from the server is ready
			var data = connection.data.getBytes();
			console.log('[tls] received: ' + data);
			cleartextStream.emit('data', new Buffer(data));
		},
		closed: function() {
			console.log('[tls] disconnected');
			cleartextStream.emit('end');
		},
		error: function(connection, error) {
			console.log('[tls] error', error);
			cleartextStream.emit('error', error);
		}
	});

	socket.on('data', function(data) {
		client.process(data.toString('binary')); // encoding should be 'binary'
	});
	socket.on('end', function() {
		console.log('[socket] disconnected');
		cleartextStream.emit('end');
	});
	if (socket.readyState !== 'open') {
		socket.on('connect', function() {
			console.log('[socket] connected');
			client.handshake();
		});
	} else {
		client.handshake();
	}

	cleartextStream.end = function (data) {
		socket.end(data);
	};
	cleartextStream.destroy = function () {
		destroy.end();
	};

	// Forward events from cleartextStream to options.socket
	// Unencrypted messages are sent to the original socket
	cleartextStream.on('data', function (data) {
		options.socket.emit('data', data);
	});
	cleartextStream.on('end', function (data) {
		options.socket.emit('end', data);
	});

	return cleartextStream;
};