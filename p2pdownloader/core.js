var utils = require('./utils');
var crypto = require('./crypto');
var config = require('./config');

var users = {};
var updates_server = null, blocks_server = null;
var files = config.files;

function calculate_file_size(blocks) {
    var data_length = 0;
    for(var b in blocks) {
        data_length += blocks[b].length;
    }

    return data_length;
}

exports.initialize = function(updates, blocks) {
    updates_server = updates; 
    blocks_server = blocks;

    console.log("[*] Initializing files list...");
    for (var fileid in files) {
        file = files[fileid];
        if (typeof file.original_file !== "undefined") {
            file.data = utils.divide_file_into_blocks(utils.readFile(file.original_file), file.block_size)
        }

        file.signatures = {};
        for (var block_offset in file.data) {
            file.signatures[block_offset] = crypto.sign(config.signing_keys.prvKeyObj, file.data[block_offset], block_offset);
        }
    }
    console.log("    Done.");
};

exports.get_ice_servers = function() {
    return config.ice_servers;
}

exports.get_pubkey = function() {
    return config.signing_keys.pubKeyObj;
}

exports.handle_open = function(conn, req) {
    file_id = req.query.fileid;

    if (undefined == file_id) {
        console.log("[!] No file id requested.");
        conn.send(utils.pack({type: "error", message: "File ID missing."}));
        conn.close();
        return;
    }

    if (!(file_id in files)) {
        console.log("[!] Requested a non existing file.");
        conn.send(utils.pack({type: "error", message: "File does not exist."}));
        conn.close();
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
        block_size: files[file_id].block_size,
        file_size: calculate_file_size(files[file_id].data),
        file_name: files[file_id].filename,
        mime_type: files[file_id].mime_type,
        pubkey: crypto.jsonify_key(config.signing_keys.pubKeyObj),
        ice_servers: config.ice_servers
    }));

    broadcast_state(userid, true);

    console.log(`[*] New client has connected! (id=${userid})`);
};

exports.handle_close = function(conn) {
    broadcast_state(conn.id, false);
    delete users[conn.id];
    console.log(`[*] Client disconnected! (id=${conn.id})`);
};

exports.handle_message = function(conn, msg) {
    try {
        data = JSON.parse(msg);
    } catch(e) {
        console.log("[!] handle_message: Could not parse JSON: " + msg);
        conn.send(utils.pack({type: 'error', message: 'Could not parse JSON.'}));
        conn.close();
        return;
    }

    // TODO: validate for each operation that the target user and requesting user
    // are peers that are downloading the same file id
    switch (data.type) {
        case 'fresh_block':
            if (undefined == conn.file_id || !(conn.file_id in files)) {
                console.log("[!] Bad file id");
                return;
            }

            file_blocks = files[conn.file_id].data;
            file_signatures = files[conn.file_id].signatures;
            
            user_nonpending_blocks = data.nonpending_blocks;
            user_pending_blocks = data.pending_blocks;

            if (user_nonpending_blocks.length > 0) {
                lst = user_nonpending_blocks;
            } else {
                lst = user_pending_blocks;
            }

            block_offset = lst[Math.floor(Math.random() * lst.length)];

            if (!(block_offset in file_blocks)) {
                console.log("[!] Peer asked for invalid block_offset");
                conn.send(utils.pack({type: 'error', message: 'Invalid block_offset '})); /* maybe catch exception if connection has closed? */
                conn.close();
                return;
            }

            console.log("[*] Handing block offset " + block_offset + " for peer " + conn.id);
            block_data = file_blocks[block_offset];

            /* maybe catch exception if connection has closed? */
            conn.send(utils.pack({type: "block", block_offset: block_offset, length: block_data.length, signature: file_signatures[block_offset]}));
            break;

        case 'offer':
            console.log("[*] Sending offer from " + conn.id +  " to " + data.remote_peer_id);
            try {
                remote_user = users[data.remote_peer_id];
                if (remote_user.file_id != conn.file_id) {
                    console.log("[!] File id mismatch!");
                    conn.close();
                    return;
                }
                remote_user.send(utils.pack({type: 'offer', offer: data.offer, remote_peer_id: conn.id}));
            } catch (e) {
                console.log("[!] Error sending offer");
            }
            break;

        case 'answer':
            console.log("[*] Sending answer from " + conn.id +  " to " + data.remote_peer_id);
            try {
                remote_user = users[data.remote_peer_id];
                if (remote_user.file_id != conn.file_id) {
                    console.log("[!] File id mismatch!");
                    conn.close();
                    return;
                }
                remote_user.send(utils.pack({type: 'answer', answer: data.answer, remote_peer_id: conn.id}));
            } catch (e) {
                console.log("[!] Error sending answer");
            }
            break;

        case 'candidate':
            console.log("[*] Sending candidate from " + conn.id +  " to " + data.remote_peer_id);
            try {
                remote_user = users[data.remote_peer_id];
                if (remote_user.file_id != conn.file_id) {
                    console.log("[!] File id mismatch!");
                    conn.close();
                    return;
                }
                remote_user.send(utils.pack({type: 'candidate', candidate: data.candidate, remote_peer_id: conn.id}));
            } catch (e) {
                console.log("[!] Error sending candidate");
            }
            break;

        default:
            conn.send(utils.pack({type: 'error', message: 'Command not found: ' + data.type}));
            conn.close();
            break;
    }
};

exports.handle_blocks_message = function(conn, msg) {
    try {
        data = JSON.parse(msg);
    } catch(e) {
        console.log("[*] handle_message: Could not parse JSON: " + msg);
        conn.send(utils.pack({type: 'error', message: 'Could not parse JSON.'}));
        conn.close();
        return;
    }

    switch (data.type) {
        case 'block':
            if (!(data.file_id in files) || !(data.block_offset in files[data.file_id].data)) {
                console.log("[*] Bad file id or offset");
                if (conn.readyState == 1) {
                    conn.send(utils.pack({type: 'error', message: 'Bad file id or offset'}));
                }
                conn.close();
                return;
            }

            file_blocks = files[data.file_id].data;
            block_data = file_blocks[data.block_offset];
            max_bps = files[data.file_id].max_bps;

            setTimeout(function() {
                if (conn.readyState == 1) {
                    conn.send(this.block_data, {binary: true, mask: false});
                }
            }.bind({block_data: block_data, max_bps: max_bps}), block_data.length * (1/max_bps) * 1000);
            break;

        default:
            conn.send(utils.pack({type: 'error', message: 'Command not found: ' + data.type}));
            conn.close();
            break;
    }
}


exports.handle_blocks_close = function(conn) {
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
    users[id].file_id = file_id;
    return id;
}

function broadcast_state(userid, state) {
    // state: {true, false} ~ {connected, disconnected}
    updates_server.clients.forEach(function (conn) {
        if (conn.id !== undefined && conn.id != this.userid && conn.file_id == users[userid].file_id) {
            if (conn.readyState == 1) {
                conn.send(utils.pack({type: 'state', id: this.userid, state: this.state}));
            }
        }
    }.bind({userid: userid, state: state}));
}
