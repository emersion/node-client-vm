var net = require('net');
var server = net.createServer(function(c) { //'connection' listener
  console.log('server connected');
  c.on('end', function() {
    console.log('server disconnected');
  });
  c.on('data', function (chunk) {
  	console.log(chunk);
  	c.write(chunk, 'binary');
  });
});
server.listen(9000, function() { //'listening' listener
  console.log('server bound');
});