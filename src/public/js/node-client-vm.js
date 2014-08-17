(function () {
	var global = this;

	/**
	 * Node client virtual machine.
	 * @author emersion <contact@emersion.fr>
	 * @license The MIT license
	 */
	var Node = {};

	/**
	 * The Buffer implementation.
	 * This will be populated when loading core modules.
	 */
	Node.Buffer = null;

	// Helper functions for communicating with the server
	/**
	 * Call a wrapper.
	 * @param  {String} endpoint The wrapper endpoint.
	 * @param  {Array}  data     Arguments to provide to the wrapper.
	 * @param  {String} [type]   The request method.
	 * @return {$.Deferred}      A deferred object.
	 */
	var callWrapper = function (endpoint, data, type) {
		return $.ajax({
			url: '/api/vm/wrap'+endpoint,
			type: type || 'post',
			contentType: 'application/json',
			processData: false,
			data: JSON.stringify(data)
		}).then(function (results) {
			return results;
		});
	};
	// Same as above, but taking an Arguments object as data
	var wrap = function (endpoint, args) {
		args = Array.prototype.slice.call(args);
		return callWrapper(endpoint, args).then(function (results) {
			return results;
		});
	};

	// Call a core method
	var callCore = function (endpoint, data, opts) {
		opts = $.extend({
			type: 'post'
		}, opts);

		return $.ajax({
			url: '/api/vm/core'+endpoint,
			type: opts.type,
			contentType: 'application/json',
			processData: false,
			data: JSON.stringify(data)
		}).then(function (results) {
			return results;
		});
	};
	/**
	 * Asynchronously call a core method.
	 * @param  {String} endpoint The method endpoint.
	 * @param  {Arguments} args  Arguments to pass to the method.
	 * @return {$.Deferred}      A deferred object.
	 */
	var denodeify = function (endpoint, args) {
		args = Array.prototype.slice.call(args);
		var callback = args.pop();

		return callCore(endpoint, args).then(function (results) {
			callback.apply({}, results);
		});
	};

	/**
	 * The `process` object.
	 */
	var process = (function () {
		// Some native wrappers
		var native = {};
		native.timer_wrap = (function () {
			//TODO: https://github.com/joyent/node/blob/master/src/timer_wrap.cc
			var timer = {};

			timer.Timer = function () {};
			timer.Timer.prototype = {
				close: function () {},
				ref: function () {},
				unref: function () {},

				start: function () {},
				stop: function () {},

				setRepeat: function () {},
				getRepeat: function () {},
				again: function () {}
			};
			timer.Timer.now = function () {
				return (new Date()).getTime();
			};
			timer.Timer.kOnTimeout = 0;

			return timer;
		})();
		native.uv = (function () {
			//TODO: https://github.com/joyent/node/blob/master/src/uv.cc
			var uv = {};

			uv.errname = function (err) {
				if (err >= 0) {
					throw new Error("err >= 0");
				}

				return ''; //TODO: get err name
			};

			//TODO: UV_* constants

			return uv;
		})();
		native.tcp_wrap = (function () {
			//TODO: https://github.com/joyent/node/blob/master/src/tcp_wrap.cc
			var tcp = {};

			tcp.TCP = function () {
				this._reading = false;
			};
			tcp.TCP.prototype = {
				_connectWebSocket: function () {
					var that = this;

					if (this._ws) {
						return $.Deferred().resolveWith(this._ws);
					}

					var deferred = $.Deferred();

					this._ws = new WebSocket('ws://'+window.location.host+'/api/vm/wrap/tcp/socket?fd='+this.fd);
					this._ws.addEventListener('open', function () {
						console.log('TCP OK');
						deferred.resolveWith(that._ws);
					});
					this._ws.addEventListener('error', function () {
						console.log('TCP error');
					});
					this._ws.addEventListener('message', function (e) {
						var contents = e.data;

						if (typeof that.onread == 'function' && that._reading) {
							var gotBuffer = function (buffer) {
								that.onread(buffer, 0, buffer.length);
							};

							if (typeof contents == 'string') {
								var buffer = new Node.Buffer(contents);
								gotBuffer(buffer);
							} else if (window.Blob && contents instanceof Blob) {
								var fileReader = new FileReader();
								fileReader.addEventListener('load', function (e) {
									var buf = fileReader.result;
									var arr = new Uint8Array(buf);
									gotBuffer(new Node.Buffer(arr));
								});
								fileReader.readAsArrayBuffer(contents);
							} else {
								console.error('Cannot read TCP stream: unsupported message type', contents);
							}
						}
					});
					this._ws.addEventListener('close', function () {
						console.log('TCP closed');
						that._ws = null;
					});

					return deferred;
				},

				close: function () {
					console.log('TCP close');
					this._ws.close();
					this._ws = null;
				},
				unref: function () {
					console.warn('TCP unref');
				},
				ref: function () {
					console.warn('TCP ref');
				},

				readStart: function () {
					this._reading = true;
				},
				readStop: function () {
					this._reading = false;
				},
				shutdown: function () {
					console.warn('shutdown');
				},

				writeBuffer: function (buf) {
					var that = this;
					var req = {};

					this._ws.send(buf);

					// TODO: wait for a confirm message from server?
					setTimeout(function () {
						req.oncomplete(0, that, req);
					}, 0);

					return req;
				},
				writeAsciiString: function (str) {
					return this.writeBuffer(str);
				},
				writeUtf8String: function (str) {
					return this.writeBuffer(str);
				},
				writeUcs2String: function (str) {
					return this.writeBuffer(str);
				},

				open: function () {
					console.warn('TCP open');
				},
				bind: function () {
					console.warn('TCP bind');
				},
				listen: function () {
					throw new Error('tcp_wrap.listen() is not implemented in the browser');
				},
				connect: function () {
					var that = this;
					console.log('TCP connect', arguments);

					var req = {};
					wrap('/tcp/connect', arguments).then(function (results) {
						var handle = results[1];
						that.fd = handle.fd;

						results[1] = that;
						results[2] = req;

						that._connectWebSocket().then(function () {
							req.oncomplete.apply(req, results);
						}, function () {
							req.oncomplete('Cannot open TCP socket: unable to open WebSocket');
						});
					});
					return req;
				},
				bind6: function () {
					console.warn('TCP bind6');
				},
				connect6: function () {
					console.warn('TCP connect6');
				},
				getsockname: function () {
					console.warn('TCP getsockname');
				},
				getpeername: function () {
					console.warn('TCP getpeername');
				},
				setNoDelay: function () {
					console.warn('TCP setNoDelay', arguments);
				},
				setKeepAlive: function () {
					console.warn('TCP setKeepAlive', arguments);
				}
			};

			return tcp;
		})();
		native.pipe_wrap = (function () {
			//TODO: not impemented
			var pipe = {};

			pipe.Pipe = function () {};
			pipe.Pipe.prototype = {
				close: function () {},
				unref: function () {},
				ref: function () {},

				setBlocking: function () {},

				readStart: function () {},
				readStop: function () {},
				shutdown: function () {},

				writeBuffer: function () {},
				writeAsciiString: function () {},
				writeUtf8String: function () {},
				writeUcs2String: function () {},

				bind: function () {},
				listen: function () {},
				connect: function () {},
				open: function () {}
			};

			return pipe;
		})();
		native.constants = (function () {
			//TODO: https://github.com/joyent/node/blob/master/src/node_constants.cc
			// @see http://www.virtsync.com/c-error-codes-include-errno
			var constants = {};
			console.warn('constants native binding not implemented');

			return constants;
		})();
		/**
		 * Emulation of the native `os` binding.
		 */
		native.os = (function () {
			var startTime = (new Date()).getTime();

			var os = {};

			os.getEndianness = function () {
				return '';
			};
			os.getHostname = function () {
				return 'localhost';
			};
			os.getLoadAvg = function () {
				return [1, 1, 1];
			};
			os.getUptime = function () {
				return (new Date()).getTime() - startTime;
			};
			os.getTotalMem = function () {
				return 1024 * 1024 * 1024;
			};
			os.getFreeMem = function () {
				return os.getTotalMem();
			};
			os.getCPUs = function () {
				return [{
					model: 'Javascript Virtual CPU',
					speed: 3,
					times: {
						user: 0,
						nice: 0,
						sys: 0,
						idle: 0,
						irq: 0
					}
				}];
			};
			os.getOSType = function () {
				return 'Linux';
			};
			os.getOSRelease = function () {
				return '3.16.1-1-ARCH';
			};
			os.getInterfaceAddresses = function () {
				return {};
			};

			return os;
		})();

		return {
			strin: null,
			stdout: null,
			argv: ['node'],
			execPath: '/usr/bin/node',
			execArgv: [],
			abort: function () {},
			chdir: function () {},
			cwd: function () {
				return '/';
			},
			env: {},
			exit: function () {},
			version: 'v0.10.30',
			versions: {},
			config: {},
			kill: function () {},
			pid: 0,
			title: 'node',
			arch: 'x64',
			platform: 'linux',
			features: {
				debug: false,
				uv: false,
				ipv6: false,
				tls_npn: false,
				tls_sni: false,
				tls: true
			},
			domain: null,
			nextTick: function (callback) {
				return setTimeout(callback, 0);
			},
			binding: function (id) {
				var binding = native[id];
console.info('binding '+id);
				if (typeof binding == 'undefined') {
					console.warn('TODO: unimplemented binding: '+id);
					return {};
				}
				
				return binding;
			}
		};
	})();

	/**
	 * Core modules.
	 */
	var core = (function () {
		var core = {};

		core.dns = (function () {
			var exports = {};

			exports.lookup = function () {
				if (typeof arguments[1] == 'object') {
					arguments[1] = 0;
				}
				denodeify('/dns/lookup', arguments);
			};

			return exports;
		})();

		return core;
	})();

	/**
	 * Core modules from Node.js source.
	 */
	var coreScripts = null;

	/**
	 * Load the core.
	 */
	var loadCore = function () {
		if (coreScripts) {
			return $.Deferred().resolveWith(coreScripts);
		}

		return $.ajax({
			url: '/api/vm/core',
			type: 'get'
		}).then(function (coreData) {
			coreScripts = coreData.libs;
			core.buffer = (new Node.Module(coreData.modules['buffer'])).run();
			Node.Buffer = core.buffer.Buffer;
			core.crypto = (new Node.Module(coreData.modules['crypto'])).run();
			
			var forge = core['node-forge'] = (new Node.Module(coreData.modules['node-forge'])).run();
			forge.disableNativeCode = true;
		});
	};

	var runScript = function (module, script, bindings) {
		// Create a new export context, saving the current one
		var parentExports = module.exports;
		module.exports = {};

		// Local scope
		bindings = $.extend({
			__filename: module.filename,
			__dirname: ''
		}, bindings, {
			global: global,
			process: process,
			console: global.console,
			Buffer: Node.Buffer,
			require: module.require.bind(module), // TODO: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind#Browser_compatibility
			module: module,
			exports: module.exports
		});

		var argsNames = [],
			argsValues = [],
			bindingsObjName = '_node_module_context';
		for (var bindingName in bindings) {
			var bindingValue = bindings[bindingName];

			argsNames.push(bindingName);
			argsValues.push(bindingsObjName + '.' + bindingName);
		}

		var parentModule = global['_node_module'],
			parentBindings = global[bindingsObjName];

		global['_node_module'] = module;
		global[bindingsObjName] = bindings;
		script = '(function ('+argsNames.join(', ')+') { '+
			script+
			'\n}).call(_node_module, '+argsValues.join(', ')+');'+
			'\n//# sourceURL='+module.id+'/'+bindings.__filename;
		//TODO: look for exports local variable and populate module.exports

		$.globalEval(script);

		global['_node_module'] = parentModule;
		global[bindingsObjName] = parentBindings;

		var exports = module.exports;
		module.exports = parentExports;
		return exports;
	};

	/**
	 * A Node module.
	 * @param {Object} data   The module data.
	 * @param {Node.Module} parent The parent module.
	 */
	Node.Module = function (data, parent) {
		this._package = data['package'];
		this._files = data.files;

		this.id = data.id;
		this.filename = this._package.main || 'index.js';
		this.loaded = false;

		this.parent = parent || null;
		this.children = [];
		if (data.dependencies) {
			for (var depName in data.dependencies) {
				var depData = data.dependencies[depName];
				this.children.push(new Node.Module(depData, this));
			}
		}

		this.require.cache = {};

		this.exports = {};
	};
	Node.Module.prototype = {
		require: function (id) {
console.info('require '+id);
			var exports = {};

			if (id.substr(0, 2) == './' || id.substr(0, 3) == '../') {
				var path = this.require('path');

				//TODO: do not use _node_module_context.__dirname
				var resolved = path.resolve(_node_module_context.__dirname, id);

				// Relative to the current working directory
				id = './'+path.relative(process.cwd(), resolved);
			}

			// Check cache
			if (typeof this.require.cache[id] != 'undefined') {
console.log('require cached '+id);
				return this.require.cache[id];
			}

			var parentId = this.require._id;
			if (parentId) { // Prevent cyclic dependencies by saving unfinished exports
				this.require.cache[parentId] = this.exports;
			}
			this.require._id = id;

			if (typeof core[id] != 'undefined') {
console.log('require core module '+id);
				exports = core[id];
			} else if (typeof coreScripts[id] != 'undefined') {
console.log('require core lib '+id);
				// TODO: use a core module
				exports = runScript(this, coreScripts[id], {
					__filename: id + '.js',
					__dirname: process.cwd() //TODO
				});
			} else if (id.substr(0, 2) == './') {
				var path = this.require('path');

				var pathname = id.substr(2);

				var files = this._files;

				var pathsToTry = [
					{ path: pathname },
					{ path: pathname+'.js', type: 'js' },
					{ path: pathname+'.json', type: 'json' },
					{ path: pathname+'.node', type: 'addon' },
					{ path: pathname+'/package.json', type: 'package' },
					{ path: pathname+'/index.js', type: 'js' },
					{ path: pathname+'/index.node', type: 'addon' }
				];
				
				var dep = null;
				for (var i = 0; i < pathsToTry.length; i++) {
					var toTry = pathsToTry[i];

					if (!toTry.type) {
						toTry.type = 'js'; //TODO: json support
					}

					if (typeof files[toTry.path] != 'undefined') {
						dep = {
							path: toTry.path,
							type: toTry.type,
							contents: files[toTry.path]
						};
					}
				}

				if (!dep) {
					throw new Error('Cannot find module \''+id+'\'');
				}

				if (dep.type == 'js') {
console.log('require file '+id, dep.path);
					exports = runScript(this, dep.contents, {
						__filename: dep.path,
						__dirname: path.dirname(dep.path)
					});
				} else if (dep.type == 'json') {
					exports = JSON.parse(dep.contents);
				} else if (dep.type == 'addon') {
					throw new Error('Cannot load module \''+id+'\': node addons are not supported');
				} else if (dep.type == 'package') {
					//TODO: parse package.json, build a new module, run module
					throw new Error('Cannot load module \''+id+'\': loading submodules is not implemented for the moment');
				}
			} else {
				var childToRun = null;
				for (var i = 0; i < this.children.length; i++) {
					var child = this.children[i];

					if (child.id === id) {
						childToRun = child;
						break;
					}
				}

				if (childToRun) {
					exports = childToRun.run();
				} else {
					console.warn('TODO: require '+id);
				}
			}

			// Restore parent id
			this.require._id = parentId;

			this.require.cache[id] = exports;

			return exports;
		},
		/**
		 * Run the module.
		 * @param  {Object} opts Options for running. Ignored for the moment.
		 * @return {Object}      The module exports.
		 */
		run: function (opts) {
			var path = this.require('path');

			var mainPath = this.filename,
				mainScript;

			var pathsToTry = [this.filename, this.filename+'.js'];
			for (var i = 0; i < pathsToTry.length; i++) {
				var pathname = pathsToTry[i];
				if (pathname.substr(0, 2) == './') {
					pathname = pathname.substr(2);
					console.log(pathname);
				}

				mainScript = this._files[pathname];

				if (typeof mainScript != 'undefined') {
					this.filename = pathname;
					return runScript(this, mainScript, {
						__filename: pathname,
						__dirname: path.dirname(pathname)
					});
				}
			}

			throw new Error('Cannot load module '+this.id+': no main script specified');
		}
	};
	Node.Module.prototype.require.resolve = function (id) {
		console.log('TODO: require.resolve '+id);

		return '';
	};

	/**
	 * Load a Node module.
	 * @param  {String} moduleName The module name. Must be installed via `npm install <module>`.
	 * @return {jQuery.Deferred}   The deferred object.
	 */
	Node.Module.load = function (moduleName) {
		return loadCore().then(function () {
			return $.ajax({
				url: '/api/vm/load/'+moduleName,
				type: 'get'
			}).then(function (moduleData) {
				return new Node.Module(moduleData);
			});
		});
	};

	// Export API
	global.Node = Node;
}).call(this);