var core = require('./core');

var express = require('express');
var staticFile = require('connect-static-file');
var expressWs = require('express-ws');

var app = express();
var appWs = expressWs(app);

app.get('/', function (req, res) {
    res.redirect('/main');
})

app.use('/main', staticFile('client-side/main.htm'));
app.use('/main.js', staticFile('client-side/main.js'));
app.use('/jquery.js', staticFile('client-side/jquery-3.1.1.min.js'));

app.ws('/updates', function(conn, req) {
    try {
        conn.on('message', function(msg) {
            core.handle_message(conn, msg);
        });

        conn.on('close', function() {
            core.handle_close(conn);
        });

        core.handle_open(conn, req);
    } catch (err) {
        console.error(err);
    }
});

app.ws('/blocks', function(conn, req) {
    try {
        conn.on('message', function(msg) {
            core.handle_block(conn, msg);
        });

        conn.on('close', function() {
            core.handle_block_close(conn);
        });
    } catch (err) {
        console.error(err);
    }
});

core.set_servers(appWs.getWss('/updates'), appWs.getWss('/blocks'));

app.listen(80);
