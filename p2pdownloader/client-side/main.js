var server = "localhost:80";

var updates = null;

var id = null;
var users = null;
var block_size = null;

var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
};

function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
        return entityMap[s];
    });
}

function log(msg) {
    $('#console').append(escapeHtml(msg) + '<br />');
}

function handle_message(data) {
    switch (data.type) {
    case 'hello':
        id = data.id;
        users = data.users;
        block_size = data.block_size;

        send_message({type: 'fresh_block'});
        break;

    case 'state':
        if (data.state) {
            users.push(data.id);
        } else {
            users.splice(users.indexOf(data.id), 1);
        }
        log('[**] Current users list: ' + users);
        break;

    case 'block':
        params = data.params;
        // TODO: Connect to the 'blocks' endpoint in the server and ask for a block
        break;

    case 'error':
        log('[**] Error from server: ' + data.message);
        break;
    }
}

function send_message(msg) {
    log('C->S ' + msg);
    updates.send(JSON.stringify(msg));
}

$(document).ready(function() {
    updates = new WebSocket('ws://' + server + '/updates', ['soap', 'xmpp']);

    updates.onopen = function (event) {
        log('[**] Connected to server.');
    };

    updates.onmessage = function (event) {
        log('S->C ' + event.data);
        data = JSON.parse(event.data);
        handle_message(data);
    }

    updates.onclose = function (event) {
        log('[**] Disconnected.');
    }
});
