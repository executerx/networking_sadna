var core = require('./core');

var express = require('express');
var staticFile = require('connect-static-file');
var expressWs = require('express-ws');

var app = express();
var appWs = expressWs(app);

app.get('/', function (req, res) {
    res.redirect('/main');
});

app.use('/main', staticFile('client-side/main.htm'));
app.use('/download', staticFile('client-side/download.htm'));
app.use('/download.js', staticFile('client-side/download.js'));
app.use('/adapter.js', staticFile('client-side/adapter.js'));
app.use('/jquery.js', staticFile('client-side/jquery-3.1.1.min.js'));
app.use('/FileSaver.js', staticFile('client-side/FileSaver.min.js'));

app.ws('/updates', function(conn, req) {
    try {
        conn.on('message', function(msg) {
            core.handle_message(this.conn, msg);
        }.bind({ conn: conn }));

        conn.on('close', function() {
            core.handle_close(this.conn);
        }.bind({ conn: conn }));

        core.handle_open(conn, req); /* should not this be in the conn.on('open') event? */
    } catch (err) {
        console.error(err);
    }
});

app.ws('/blocks', function(conn, req) {
    try {
        conn.on('close', function() {
            core.handle_block_close(this.conn);
        }.bind({ conn: conn }));

        conn.on('message', function(msg) {
            core.handle_blocks_message(this.conn, msg);
        }.bind({ conn: conn }));
    } catch (err) {
        console.error(err);
    }
});

core.set_servers(appWs.getWss('/updates'), appWs.getWss('/blocks'));

app.listen(8081);
