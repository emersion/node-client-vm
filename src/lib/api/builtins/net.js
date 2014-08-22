var stream = require('stream');
var util = require('util');
var timers = require('timers');
var http = require('http');

var debug = util.debuglog('net');

exports.createServer = function () {
	throw new Error('Cannot create server in a browser');
};

exports.connect = exports.createConnection = function (/* options, connectListener */) {
	var args = normalizeConnectArgs(arguments);
	debug('createConnection', args);
	var s = new Socket(args[0]);
	return Socket.prototype.connect.apply(s, args);
};

function toNumber(x) { return (x = Number(x)) >= 0 ? x : false; }

function isPipeName(s) {
	return util.isString(s) && toNumber(s) === false;
}

// Returns an array [options] or [options, cb]
// It is the same as the argument of Socket.prototype.connect().
function normalizeConnectArgs(args) {
	var options = {};
	if (util.isObject(args[0])) {
		// connect(options, [cb])
		options = args[0];
	} else if (isPipeName(args[0])) {
		// connect(path, [cb]);
		options.path = args[0];
	} else {
		// connect(port, [host], [cb])
		options.port = args[0];
		if (util.isString(args[1])) {
			options.host = args[1];
		}
	}
	var cb = args[args.length - 1];
	return util.isFunction(cb) ? [options, cb] : [options];
}
exports._normalizeConnectArgs = normalizeConnectArgs;

function Socket(options) {
	if (!(this instanceof Socket)) return new Socket(options);

	this._connecting = false;
	this._host = null;

	if (util.isNumber(options))
		options = { fd: options }; // Legacy interface.
	else if (util.isUndefined(options))
		options = {};

	stream.Duplex.call(this, options);

	// these will be set once there is a connection
	this.readable = this.writable = false;

	//this._pendingData = null;
	//this._pendingEncoding = '';

	// handle strings directly
	this._writableState.decodeStrings = false;

	// default to *not* allowing half open sockets
	this.allowHalfOpen = options && options.allowHalfOpen || false;
}
util.inherits(Socket, stream.Duplex);

exports.Socket = Socket;
exports.Stream = Socket; // Legacy naming.

Socket.prototype.listen = function () {
	throw new Error('Cannot listen in a browser');
};

Socket.prototype.setTimeout = function (msecs, callback) {
	if (msecs > 0 && isFinite(msecs)) {
		timers.enroll(this, msecs);
		//timers._unrefActive(this);
		if (callback) {
			this.once('timeout', callback);
		}
	} else if (msecs === 0) {
		timers.unenroll(this);
		if (callback) {
			this.removeListener('timeout', callback);
		}
	}
};

Socket.prototype._onTimeout = function () {
	debug('_onTimeout');
	this.emit('timeout');
};

Socket.prototype.setNoDelay = function (enable) {};

Socket.prototype.setKeepAlive = function (setting, msecs) {};

Socket.prototype.address = function () {}; //TODO

Object.defineProperty(Socket.prototype, 'readyState', {
	get: function() {
		if (this._connecting) {
			return 'opening';
		} else if (this.readable && this.writable) {
			return 'open';
		} else if (this.readable && !this.writable) {
			return 'readOnly';
		} else if (!this.readable && this.writable) {
			return 'writeOnly';
		} else {
			return 'closed';
		}
	}
});

Socket.prototype.bufferSize = undefined;

Socket.prototype._read = function () {};

Socket.prototype.end = function(data, encoding) {
	stream.Duplex.prototype.end.call(this, data, encoding);
	this.writable = false;

	// just in case we're waiting for an EOF.
	if (this.readable && !this._readableState.endEmitted)
		this.read(0);
	else
		maybeDestroy(this);
};

// Call whenever we set writable=false or readable=false
function maybeDestroy(socket) {
	if (!socket.readable &&
		!socket.writable &&
		!socket.destroyed &&
		!socket._connecting &&
		!socket._writableState.length) {
		socket.destroy();
	}
}

Socket.prototype.destroySoon = function() {
	if (this.writable)
		this.end();
	if (this._writableState.finished)
		this.destroy();
	else
		this.once('finish', this.destroy);
};

Socket.prototype.destroy = function(exception) {
	debug('destroy', exception);
	
	if (this.destroyed) {
		return;
	}

	self._connecting = false;

	this.readable = this.writable = false;

	timers.unenroll(this);

	debug('close');

	this.destroyed = true;
};

//TODO
Socket.prototype.remoteAddress = undefined;
Socket.prototype.remoteFamily = undefined;
Socket.prototype.remotePort = undefined;

Socket.prototype.localAddress = '127.0.0.1';
Socket.prototype.localPort = '80';

Socket.prototype._write = function (data, encoding, cb) {
	cb = cb || function () {};

	// If we are still connecting, then buffer this for later.
	// The Writable logic will buffer up any more writes while
	// waiting for this one to be done.
	if (this._connecting) {
		this._pendingData = data;
		this._pendingEncoding = encoding;
		this.once('connect', function() {
			this._write(data, encoding, cb);
		});
		return;
	}
	this._pendingData = null;
	this._pendingEncoding = '';

	if (encoding == 'binary' && typeof data == 'string') {
		data = new Buffer(data, encoding); // Setting encoding is very important for binary data - otherwise the data gets modified
	}

	this._ws.send(data);

	process.nextTick(function () {
		//console.log('[tcp] sent: ', data.toString(), data.length);
		cb();
	});
};

Socket.prototype.write = function(chunk, encoding, cb) {
	if (!util.isString(chunk) && !util.isBuffer(chunk))
		throw new TypeError('invalid data');
	return stream.Duplex.prototype.write.apply(this, arguments);
};

//TODO
Socket.prototype.bytesWritten = 0;

Socket.prototype.connect = function(options, cb) {
	var self = this;
	
	if (!util.isObject(options)) {
		// Old API:
		// connect(port, [host], [cb])
		// connect(path, [cb]);
		var args = normalizeConnectArgs(arguments);
		return Socket.prototype.connect.apply(this, args);
	}

	cb = cb || function () {};

	if (this.write !== Socket.prototype.write)
		this.write = Socket.prototype.write;

	if (options.path) {
		throw new Error('options.path not supported in the browser');
	}

	self._connecting = true;
	self.writable = true;
	self._host = options.host;

	var req = http.request({
		hostname: window.location.hostname,
		port: window.location.port,
		path: '/api/vm/net/connect',
		method: 'POST'
	}, function (res) {
		var json = '';
		res.on('data', function (buf) {
			json += buf;
		});
		res.on('end', function () {
			var data = JSON.parse(json);

			if (data.error) {
				self.emit('error', data.error);
				self.destroy();
				return;
			}

			self._connectWebSocket(data.token, function (err) {
				if (err) {
					cb(err);
					return;
				}

				cb();
			});
		});
 	});

	req.setHeader('Content-Type', 'application/json');
	req.write(JSON.stringify(options));
	req.end();

	return this;
};

Socket.prototype._connectWebSocket = function (token, cb) {
	var self = this;

	if (self._ws) {
		process.nextTick(function () {
			cb();
		});
		return;
	}

	this._ws = new WebSocket('ws://'+window.location.host+'/api/vm/net/socket?token='+token);
	this._handleWebsocket();

	if (cb) {
		self.on('connect', cb);
	}
};

Socket.prototype._handleWebsocket = function () {
	var self = this;

	this._ws.addEventListener('open', function () {
		console.log('TCP OK');

		self._connecting = false;
		self.readable = true;

		self.emit('connect');

		self.read(0);
	});
	this._ws.addEventListener('error', function (e) {
		console.log('TCP error', e);
	});
	this._ws.addEventListener('message', function (e) {
		var contents = e.data;

		var gotBuffer = function (buffer) {
			//console.log('[tcp] received: ' + buffer.toString(), buffer.length);
			self.push(buffer);
		};

		if (typeof contents == 'string') {
			var buffer = new Buffer(contents);
			gotBuffer(buffer);
		} else if (window.Blob && contents instanceof Blob) {
			var fileReader = new FileReader();
			fileReader.addEventListener('load', function (e) {
				var buf = fileReader.result;
				var arr = new Uint8Array(buf);
				gotBuffer(new Buffer(arr));
			});
			fileReader.readAsArrayBuffer(contents);
		} else {
			console.warn('Cannot read TCP stream: unsupported message type', contents);
		}
	});
	this._ws.addEventListener('close', function () {
		console.log('TCP closed');
		//TODO
	});
};