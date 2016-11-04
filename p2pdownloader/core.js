var BLOCK_SIZE = 1024;
var MAX_KBPS = 0.5;

var utils = require('./utils');

var users = {};
var updates_server = null, blocks_server = null;

function divide_file_into_blocks(file_data) {
    blocks = {};
    for (var b = 0; b < file_data.length; b += BLOCK_SIZE) {
        blocks[b] = file_data.slice(b, b+BLOCK_SIZE);
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
var files = {
    1337: {
        "filename": "blah.txt",
        "mime_type": "text/plain",
        "data": divide_file_into_blocks(Buffer("pasten123456pasten123456"))
    },
    1234: {
        "filename": "chrome.jpg",
        "mime_type": "image/jpeg",
        "data": divide_file_into_blocks(utils.readFile("data/why-chrome-eats-too-much-ram.jpg"))
    },
    1001: {
        "filename": "great.py",
        "mime_type": "application/x-python",
        "data": divide_file_into_blocks(utils.readFile("data/some_text_file")),
    }
};

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
    if (!(file_id in files)) {
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
    conn.send(utils.pack({
        type: 'hello',
        id: userid,
        users: users_ids,
        block_size: BLOCK_SIZE,
        file_size: calculate_file_size(files[file_id].data),
        file_name: files[file_id].filename,
        mime_type: files[file_id].mime_type,
    }));

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
            if (undefined == conn.file_id || !(conn.file_id in files)) {
                console.log("[*] Bad file id");
                return;
            }

            file_blocks = files[conn.file_id].data;
            user_nonpending_blocks = data.nonpending_blocks;
            user_pending_blocks = data.pending_blocks;

            if (user_nonpending_blocks.length > 0) {
                lst = user_nonpending_blocks;
            } else {
                lst = user_pending_blocks;
            }

            block_offset = lst[Math.floor(Math.random() * lst.length)];
            console.log("Handing block offset " + block_offset + " for peer");
            block_data = file_blocks[block_offset];

            conn.send(utils.pack({type: "block", block_offset: block_offset, length: block_data.length}));
            break;

        case 'offer':
            console.log("Sending offer from " + conn.id + " " + data.id +  " to " + data.remote_peer_id);
            try {
                remote_user = users[data.remote_peer_id];
                remote_user.send(utils.pack({type: 'offer', offer: data.offer, remote_peer_id: conn.id}));
            } catch (e) {
                console.log("Error sending offer");
            }
            break;

        case 'answer':
            console.log("Sending answer from " + conn.id + " " + data.id +  " to " + data.remote_peer_id);
            try {
                remote_user = users[data.remote_peer_id];
                remote_user.send(utils.pack({type: 'answer', answer: data.answer, remote_peer_id: conn.id}));
            } catch (e) {
                console.log("Error sending answer");
            }
            break;

        case 'candidate':
            console.log("Sending candidate from " + conn.id + " " + data.id +  " to " + data.remote_peer_id);
            try {
                remote_user = users[data.remote_peer_id];
                remote_user.send(utils.pack({type: 'candidate', candidate: data.candidate, remote_peer_id: conn.id}));
            } catch (e) {
                console.log("Error sending candidate");
            }
            break;

        default:
            conn.send(utils.pack({type: 'error', message: 'Command not found: ' + data.type}));
            conn.close();
            break;
    }
};

exports.handle_block_open = function(conn, req) {
    if (undefined == req.query.file_id || !(req.query.file_id in files) || undefined == req.query.block_offset) {
        console.log("[*] Bad file id or block_offset");
        return;
    }

    file_blocks = files[req.query.file_id].data;
    block_data = file_blocks[req.query.block_offset];

    conn.send(block_data, {binary: true, mask: false});
    /*setTimeout(function() {
        conn.send(block_data, {binary: true, mask: false});
        conn.close();
    }, (block_data.length / 1024) * (1/MAX_KBPS) * 1000);*/

    // // Simulating low bandwidth: 1024 bytes at 32b/s takes 32 seconds
    // send_block(conn, block, 0, 32, 1000);
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
        if (conn.id !== undefined && conn.id != userid) {/* && conn.file_id == users[userid].file_id) { // change this later as this fails because no file_id */
            conn.send(utils.pack({type: 'state', id: userid, state: state}));
        }
    });
}
