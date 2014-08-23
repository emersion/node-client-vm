var server = require('http').createServer();
var app = require('./app')(server);
server.addListener('request', app);

server.listen(app.get('port'), function() {
	console.log('Server listening on port ' + app.get('port'));
});

module.exports = server;