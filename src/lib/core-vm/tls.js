var net = require('net');
var Stream = require('stream');
var forge = require('node-forge');

function startTLS(options, cleartextStream, callback) {
	var socket = new net.Socket({
		handle: options.socket._handle
	});

	var readBuffer = null;

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
			var data = connection.data.getBytes(),
				buffer = new Buffer(data);

			console.log('[tls] received: ' + data);
			
			readBuffer = buffer;

			//cleartextStream.emit('data', buffer);
			cleartextStream.push(buffer);
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

	cleartextStream.end = function (data) {
		socket.end(data);
	};
	cleartextStream.destroy = function () {
		socket.destroy();
	};

	client.handshake();
}

exports.connect = function (options, callback) {
	options = options || {};
	callback = callback || function () {};

	if (!options.socket) {
		throw new Error('tls.connect() without providing a socket is not supported for the moment');
	}

	// TODO: implement TLSSocket
	var cleartextStream = new Stream.Readable;
	cleartextStream.readable = true;
	cleartextStream.encrypted = true;

	// Triggered when reading starts
	cleartextStream._read = function () {};

	// Forward events from cleartextStream to options.socket
	// Unencrypted messages are sent to the original socket
	// Only if in flowing mode (if there is a listener for the `data` event)
	var isForwardingData = false;
	cleartextStream.on('newListener', function (eventName, cb) {
		if (!isForwardingData && eventName == 'data') {
			isForwardingData = true; // It's important to change this before calling .on() for infinite loops
			cleartextStream.on('data', function (data) {
				options.socket.emit('data', data);
			});
		}
	});
	cleartextStream.on('end', function (data) {
		options.socket.emit('end', data);
	});

	if (options.socket.readyState !== 'open') {
		options.socket.on('connect', function() {
			console.log('[socket] connected');
			startTLS(options, cleartextStream, callback);
		});
	} else {
		startTLS(options, cleartextStream, callback);
	}

	return cleartextStream;
};