var BLOCK_SIZE = 6; /* length of "Pasten" */

var utils = require('./utils');

var users = {};
var updates_server = null, blocks_server = null;

function divide_file_into_blocks(file_data) {
    blocks = {};
    for (var b = 0; b < file_data.length; b += BLOCK_SIZE) {
        blocks[b] = file_data.substr(b, b + BLOCK_SIZE);
    }

    return blocks;
}

function calculate_file_size(blocks) {
    var data_length = 0;
    for(var b in blocks) {
        data_length += blocks[b].length;
    }

    return data_length;
}

/* a dictionary of file ids and their content divided into blocks */
var files_blocks = { 1337: divide_file_into_blocks("pasten123456") };

exports.set_servers = function(updates, blocks) {
    updates_server = updates;
    blocks_server = blocks;
};


exports.handle_open = function(conn, req) {
    file_id = req.query.fileid;
    if (undefined == file_id) {
        console.log("[*] No file id requested.");
        conn.send(utils.pack({type: "error", message: "File ID missing."}));
        return;
    }
    if (!(file_id in files_blocks)) {
        console.log("[*] Requested a non existing file.");
        conn.send(utils.pack({type: "error", message: "File does not exist."}));
        return;
    }
    userid = register(conn, file_id);

    users_ids = [];
    for (var k in users) {
        if (k != conn.id && users[k].file_id == conn.file_id) {
            users_ids.push(k);
        }
    }

    /* figure out a better way to calculate file length */
    conn.send(utils.pack({type: 'hello', id: userid, users: users_ids, block_size: BLOCK_SIZE,
        file_size: calculate_file_size(files_blocks[file_id])}));

    broadcast_state(userid, true);

    console.log(`[*] New client has connected! (id=${userid})`);
};

exports.handle_close = function(conn) {
    delete users[conn.id];
    broadcast_state(conn.id, false);
    console.log(`[*] Client disconnected! (id=${conn.id})`);
};

exports.handle_message = function(conn, msg) {
    try {
        data = JSON.parse(msg);
    } catch(e) {
        console.log("[*] handle_message: Could not parse JSON: " + msg);
        conn.send(utils.pack({type: 'error', message: 'Could not parse JSON.'}));
        conn.close();
        return;
    }

    // TODO: validate for each operation that the target user and requesting user
    // are peers that are downloading the same file id
    switch (data.type) {
        case 'fresh_block':
            // TODO: Decide and send the parameters of the new block
            //       the client will then use the other connection ('blocks')
            //       to request the block.
            /*params = {'paramA': 0, 'paramB': 1};
            conn.send(utils.pack({type: 'block', 'params': params }));*/
            if (undefined == conn.file_id || !(conn.file_id in files_blocks)) {
                console.log("[*] Bad file id");
                return;
            }

            file_blocks = files_blocks[conn.file_id];
            user_needed_blocks = data.remaining_blocks;
            block_offset = user_needed_blocks[Math.floor(Math.random() * user_needed_blocks.length)];
            console.log("Handing block offset " + block_offset + " for peer");
            block_data = file_blocks[block_offset];

            conn.send(utils.pack({type:"block", block_data: block_data, block_offset: block_offset}));
            break;

        case 'offer':
            console.log("Sending offer from " + conn.id + " to " + data.remote_peer_id);
            try {
                remote_user = users[data.remote_peer_id];
                remote_user.send(utils.pack({type: 'offer', offer: data.offer, remote_peer_id: conn.id}));
            } catch (e) {

            }
            break;

        case 'answer':
            console.log("Sending answer from " + conn.id + " to " + data.remote_peer_id);
            try {
                remote_user = users[data.remote_peer_id];
                remote_user.send(utils.pack({type: 'answer', answer: data.answer, remote_peer_id: conn.id}));
            } catch (e) {

            }
            break;

        case 'candidate':
            console.log("Sending candidate from " + conn.id + " to " + data.remote_peer_id);
            try {
                remote_user = users[data.remote_peer_id];
                remote_user.send(utils.pack({type: 'candidate', candidate: data.candidate, remote_peer_id: conn.id}));
            } catch (e) {

            }
            break;

        default:
            conn.send(utils.pack({type: 'error', message: 'Command not found: ' + data.type}));
            conn.close();
            break;
    }
};

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
};

exports.handle_block_close = function(conn) {
    if (conn.timeoutId != null)
        clearTimeout(conn.timeoutId);
};

function register(conn, file_id) {
    do {
        id = utils.make_random_id();
    } while (users[id] != null);

    conn.id = id;
    conn.file_id = file_id;
    users[id] = conn;
    return id;
}

function broadcast_state(userid, state) {
    // state: {true, false} ~ {connected, disconnected}
    updates_server.clients.forEach(function (conn) {
        if (conn.id != userid) {/* && conn.file_id == users[userid].file_id) { // change this later as this fails because no file_id */
            conn.send(utils.pack({type: 'state', id: userid, state: state}))
        }
    });
}

function send_block(conn, block, position, amount, delayms) {
    conn.send(block.substr(position, amount), {binary: true, mask: false});

    if (position+amount < block.length)
        conn.timeoutId = setTimeout(function() { send_block(conn, block, position+amount, amount, delayms) }, delayms);
    else
        conn.close();
}
