var express = require('express');
var bodyParser = require('body-parser');
var errorhandler = require('errorhandler');
var path = require('path');

module.exports = function (server) {
	var api = require('./lib/api')(server);
	var app = express();

	app.set('port', process.env.PORT || 3000);
	app.use(bodyParser.json());

	app.use('/api/vm', api);
	app.use(express.static(path.join(__dirname, 'public')));
	app.use(function(req, res){
		res.status(404).send('404 Not Found');
	});

	// Error handling
	if ('development' === app.get('env')) {
	  app.use(errorhandler());
	}
	app.use(function(err, req, res, next){
		console.error(err.stack);
		res.status(500).send('Something broke!');
	});

	app.once('listening', function (server) {
		console.log('hey', arguments);
	});

	return app;
};