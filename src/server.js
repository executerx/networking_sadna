var express = require('express');
var staticFile = require('connect-static-file');
var expressWs = require('express-ws');

var app = express();
expressWs(app);

app.get('/', function (req, res) {
    res.redirect('/main')
})

app.use('/main', staticFile('client-side/main.htm'));
app.use('/main.js', staticFile('client-side/main.js'));
app.use('/jquery.js', staticFile('client-side/jquery-3.1.1.min.js'));

app.get('/test', function (req, res) {
    res.send('Hello World');
})

app.ws('/updates', function(ws, req) {
    console.log('New client has connected!');

    ws.on('message', function(msg) {
        console.log('Got a message, let\'s echo that');
        ws.send('This is an echo: ' + msg);
    });

    ws.on('binaryendpoint', function open() {
        console.log('Got a message from a client from another endpoint');
        var array = new Float32Array(5);

        for (var i = 0; i < array.length; ++i) {
            array[i] = i / 2;
        }

        ws.send(array, { binary: true, mask: true });
    });

    ws.send('Hey client!');
});
 
app.listen(80);
