var express = require('express');

module.exports = function (server) {
	var app = express();

	app.use('/tcp', require('./tcp')(server));

	return app;
};