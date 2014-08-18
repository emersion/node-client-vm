Node client virtual machine
==============

Running Node.js modules in the browser!

When a module is loaded, all its dependencies are loaded too since `require()` is synchronous.

Here is a simple demo: e-mail sending using [a pure Javascript implementation of the SMTP protocol](https://github.com/substack/node-smtp-protocol). The `smtp-protocol` module is run right in the browser, using pure Javascript core modules if available (such as `events`, `path`...), browser versions (`stream`, `buffer`...) or custom polyfills (`net`, `tls`). In this demo, we a re opening a TCP socket to the SMTP server. As we cannot open raw TCP connections from the browser directly, we are using a WebSocket connection to send the TCP data through a Node.js server (something like _SMTP-over-WebSockets_). Then the connection is upgraded to a secure TSL connection, using [a client-side TLS library](https://github.com/digitalbazaar/forge). We are now able to send SMTP commands to the server (`HELO`, `AUTH` and so on).

**Live demo: http://node-client-vm.herokuapp.com/**

Running the demo
----------------

```
npm install
npm install smtp-protocol
node src/server.js
```

Hacking
-------

You can edit [`src/public/index.html`](https://github.com/emersion/node-client-vm/blob/master/src/public/index.html) to change SMTP server and credentials.

You can also take a look at [`src/public/js/node-client-vm.js`](https://github.com/emersion/node-client-vm/blob/master/src/public/js/node-client-vm.js) for the client code. Client modules are in [`src/lib/core-vm/`](https://github.com/emersion/node-client-vm/tree/master/src/lib/core-vm).
