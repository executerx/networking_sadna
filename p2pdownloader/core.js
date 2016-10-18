var BLOCK_SIZE = 1024;

var utils = require('./utils');

var users = {};
var updates_server = null, blocks_server = null;

exports.set_servers = function(updates, blocks) {
    updates_server = updates;
    blocks_server = blocks;
}

exports.handle_open = function(conn, req) {
    userid = register(conn);

    users_ids = [];
    for (var k in users) users_ids.push(k);

    conn.send(utils.pack({type: 'hello', id: userid, users: users_ids, block_size: BLOCK_SIZE}));

    broadcast_state(userid, true);

    console.log(`[*] New client has connected! (id=${userid})`);
}

exports.handle_close = function(conn) {
    delete users[conn.id];
    broadcast_state(conn.id, false);
    console.log(`[*] Client disconnected! (id=${conn.id})`);
}

exports.handle_message = function(conn, msg) {
    try {
        data = JSON.parse(msg);
    } catch(e) {
        console.log("[*] handle_message: Could not parse JSON: " + msg);
        conn.send(utils.pack({type: 'error', message: 'Could not parse JSON.'}));
        conn.close();
        return;
    }

    switch (data.type) {
        case 'fresh_block':
            // TODO: Decide and send the parameters of the new block
            //       the client will then use the other connection ('blocks')
            //       to request the block.
            params = {'paramA': 0, 'paramB': 1};
            conn.send(utils.pack({type: 'block', 'params': params }));
            break;

        default:
            conn.send(utils.pack({type: 'error', message: 'Command not found: ' + data.type}));
            conn.close();
            break;
    }
}

exports.handle_block = function(conn, msg) {
    try {
        data = JSON.parse(msg);
    } catch(e) {
        console.log("[*] handle_block: Could not parse JSON: " + msg);
        conn.close();
        return;
    }

    block = Array(BLOCK_SIZE+1).join('a'); // TODO: Bring a real block using the data as params
    
    // Simulating low bandwidth: 1024 bytes at 32b/s takes 32 seconds
    send_block(conn, block, 0, 32, 1000);
}

exports.handle_block_close = function(conn) {
    if (conn.timeoutId != null)
        clearTimeout(conn.timeoutId);
}

function register(conn) {
    do {
        id = utils.make_random_id();
    } while (users[id] != null);

    conn.id = id
    users[id] = conn;
    return id;
}

function broadcast_state(userid, state) {
    // state: {true, false} ~ {connected, disconnected}
    updates_server.clients.forEach(function (conn) {
        if (conn.id == userid) return;
        conn.send(utils.pack({type: 'state', id: userid, state: state}))
    });
}

function send_block(conn, block, position, amount, delayms) {
    conn.send(block.substr(position, amount), {binary: true, mask: false});

    if (position+amount < block.length)
        conn.timeoutId = setTimeout(function() { send_block(conn, block, position+amount, amount, delayms) }, delayms);
    else
        conn.close();
}
