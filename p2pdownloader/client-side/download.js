var server = "localhost:8081";
var broadcast_interval = 1000;

var updates = null;

var file_id = location.search.substr(1);
var my_user_id = null;
var users = null;
var block_size = null;
var peers_connections = {};
var file_blocks = {};
var blocks_timer = null;
var server_pending_block = null;

var file_size = null;
var mime_type = null;
var filename = null;

var debug = [];

var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
};

function keys_sorted(dict) {
    var keys = [];
    for (var key in dict) {
        if (dict.hasOwnProperty(key)) {
            keys.push(parseInt(key));
        }
    }
    keys.sort(function(a,b) { return a - b; });

    return keys;
}

function reconstruct_file(blocks) {
    var blobs_list = [];
    keys = keys_sorted(blocks);
    for (var b in keys) {
        if (undefined != blocks[keys[b]]) {
            blobs_list.push(blocks[keys[b]]);
        } else {
            log("[!!] Block is undefined!");
        }
    }
    return blobs_list;
}

function saveToDisk(blobs, file_name, mime_type) {
    var blob = new Blob(blobs, {type: mime_type});
    saveAs(blob, file_name);
}

function remaining_blocks() {
    var remaining_offsets = [];
    for (var b = 0; b < file_size; b += block_size) { /* isn't there a javascript one-liner for that crap? */
        remaining_offsets.push(b);
    }

    for (var b in file_blocks) {
        remaining_offsets.splice(remaining_offsets.indexOf(parseInt(b)), 1);
    }

    if (remaining_offsets.length == 0) {
        log("[**] Received entire file! Reconstructing...");
        saveToDisk(reconstruct_file(file_blocks), filename, mime_type);
        clearTimeout(blocks_timer);
    }

    return remaining_offsets;
}

function get_pending_blocks() {
    var pending = [];

    for (var user_id in peers_connections) {
        pending_block = peers_connections[user_id].pending_block;
        if (pending_block == null) continue;
        if (pending.indexOf(pending_block) != -1) continue;
        pending.push(pending_block);
    }

    if ((server_pending_block != null) && (pending.indexOf(server_pending_block) == -1))
        pending.push(server_pending_block);

    return pending;
}

function get_nonpending(remaining, pending) {
    var nonpending_blocks = [];
    for (var i in remaining) {
        b = remaining[i];
        if (pending.indexOf(b) == -1) {
            nonpending_blocks.push(b);
        }
    }
    return nonpending_blocks;
}

function broadcast_remaining_blocks() {
    needed_blocks = remaining_blocks();
    pending_blocks = get_pending_blocks();
    nonpending_blocks = get_nonpending(needed_blocks, pending_blocks);

    if (needed_blocks.length > 0) {
        for (var user_id in peers_connections) {
            peer = peers_connections[user_id];
            if ((peer.local_data_channel.readyState == "open") && !peer.request_pending) {
                log("[**] Requesting from a peer (id=" + peer.user_id + "): nonpending: " + nonpending_blocks + " pending: " + pending_blocks);
                peer.request_pending = true;
                //debug.push([peer, true]);
                peer.local_data_channel.send(JSON.stringify({type: "blocks_request", nonpending_blocks: nonpending_blocks, pending_blocks: pending_blocks, user_id: my_user_id}));
            }
        }

        /* also, ask for the server */
        if (server_pending_block == null) {
            send_message(({type: 'fresh_block', nonpending_blocks: nonpending_blocks, pending_blocks: pending_blocks}));
        }

        setTimeout(broadcast_remaining_blocks, broadcast_interval);
    }
}

function get_intersection(arr1, arr2) {
    var intr = [], o = {}, l = arr2.length, i, v;
    for (i = 0; i < l; i++) {
        o[arr2[i]] = true;
    }
    l = arr1.length;
    for (i = 0; i < l; i++) {
        v = arr1[i];
        if (v in o) {
            intr.push(v);
        }
    }
    return intr;
}

function initialize_blocks_data_channel(peer, is_local, blocks_data_channel) {
    blocks_data_channel.peer = peer;
    
    peer.request_pending = false;
    peer.next_is_data = false;

    if (is_local) {
        peer.local_data_channel = blocks_data_channel;
    } else {
        peer.remote_data_channel = blocks_data_channel;
    }

    blocks_data_channel.onopen = function(ev) {
        log("[**] Blocks data channel has opened.");
    };
    blocks_data_channel.onerror = function(error) {
        log("[!!] Error on blocks data channel:", error);
    };

    blocks_data_channel.onmessage = function(msg) {
        if (peer.next_is_data) {
            log("[**] Got block data at " + peer.pending_block + " from a peer (id=" + peer.user_id + ")");
            file_blocks[peer.pending_block] = new Blob([msg.data]);

            peer.next_is_data = false;
            peer.pending_block = null;
            peer.request_pending = false;
            //debug.push([peer, false]);
            return;
        }

        try {
            data = JSON.parse(msg.data);
        } catch (e) {
            log("[!!] Malformed message sent in block data channel.");
            // console.log(msg.data);
            //debug.push(msg);
            return;
        }

        // parse data being a list of needed blocks or rather a new block
        switch (data.type) {
            case "blocks_request":
                user_nonpending_blocks_list = data.nonpending_blocks;
                user_pending_blocks_list = data.pending_blocks;

                blocks_offsets_in_stock = [];
                for (var b in file_blocks) { /* turn this crap into one-liner */
                    blocks_offsets_in_stock.push(b);
                }

                blocks_for_user = get_intersection(user_nonpending_blocks_list, blocks_offsets_in_stock);
                if (blocks_for_user.length == 0) {
                    blocks_for_user = get_intersection(user_pending_blocks_list, blocks_offsets_in_stock);
                }

                if (blocks_for_user.length > 0) { /* if we can satisfy peer with a block */
                    block_offset = blocks_for_user[Math.floor((Math.random() * blocks_for_user.length))]; /* pick one at random */
                    log("L->R Sending block at offset " + block_offset + " to peer (id=" + peer.user_id + ")");
                    debug.push([peer, msg, blocks_data_channel]);
                    
                    var fileReader = new FileReader();
                    fileReader.onload = function() {
                        log("L->R Sent (id=" + peer.user_id + ", " + data.user_id + ")");
                        blocks_data_channel.send(JSON.stringify({type: "data_block", block_offset: block_offset}));
                        blocks_data_channel.send(this.result);
                    };
                    fileReader.readAsArrayBuffer(file_blocks[block_offset]);
                } else {
                    log("L->R No block to send to peer (id=" + peer.user_id + ")");
                    blocks_data_channel.send(JSON.stringify({type: "no_data_block"}));
                }

                break;

            case "data_block":
                log("R->L Received block at offset " + data.block_offset + " from peer (id=" + peer.user_id + ")");

                if (peer.pending_block != null) {
                    log("[!!] pending_block != null");
                }

                peer.pending_block = data.block_offset;

                /* override existing if there's any */
                peer.next_is_data = true;
                /* can compute if finished reading file but interval will be called anyways and will clear timer... */
                break;

            case "no_data_block":
                log("[**] No data block (id=" + peer.user_id + ")");

                if (!peer.request_pending) {
                    log("[!!] !request_pending at no_data_block");
                }

                peer.request_pending = false;
                //debug.push([peer, false]);
                break;

            default:
                break;
        }
    };

    blocks_data_channel.onclose = function() {
        log("[**] Blocks data channel has closed.");
    };

    return blocks_data_channel;
}

function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
        return entityMap[s];
    });
}

function log(msg) {
    $('#console').append(escapeHtml(msg) + '<br />');
}

function ice_candidate_ready(event) {
    if (event.candidate) {
        send_message({type:"candidate", candidate: event.candidate, remote_peer_id: this.user_id});
    }
}

function create_new_peer(user_id) {
    log("[**] Initializing new peer object.");
    peer = new RTCPeerConnection();
    peer.pending_block = null;
    peer.user_id = user_id;
    peer.onicecandidate = ice_candidate_ready.bind({user_id: user_id}); /* fired up when setLocalDescriptor is called */

    data_channel = peer.createDataChannel("seedchannel");
    data_channel.binaryType = "arraybuffer";
    data_channel.peer = peer;

    data_channel = initialize_blocks_data_channel(peer, true, data_channel);
    peer.ondatachannel = function(event) { initialize_blocks_data_channel(peer, false, event.channel) };

    return peer;
}

function handle_message(data) {
    switch (data.type) {
        case 'hello':
            my_user_id = data.id;
            users = data.users;
            block_size = data.block_size;
            file_size = data.file_size;
            mime_type = data.mime_type;
            filename = data.filename

            for (var idx in users) {
                user_id = users[idx];
                if (user_id != my_user_id) {
                    peer = create_new_peer(user_id);
                    peers_connections[user_id] = peer;

                    send_offer(peer, user_id); // request to peer with remote user
                }
            }


            needed_blocks = remaining_blocks();
            pending_blocks = get_pending_blocks();
            nonpending_blocks = get_nonpending(needed_blocks, pending_blocks);
            send_message(({type: 'fresh_block', nonpending_blocks: nonpending_blocks, pending_blocks: pending_blocks}));

            blocks_timer = setTimeout(broadcast_remaining_blocks, broadcast_interval);
            break;

        case 'state':
            if (data.state) { /* not really needed now since we'll receive an offer later */
                users.push(data.id);
            } else {
                users.splice(users.indexOf(data.id), 1);
            }
            log('[**] Current users list: ' + users);

            break;

        case 'offer':
            handle_offer(data.offer, data.remote_peer_id);
            break;

        case 'answer':
            handle_answer(data.answer, data.remote_peer_id);
            break;

        case 'candidate':
            handle_candidate(data.candidate, data.remote_peer_id);
            break;

        case 'block':
            block_offset = data.block_offset;
            block_length = data.length;

            server_pending_block = block_offset;

            /* override existing if there is */
            blocks = new WebSocket('ws://' + server + '/blocks/?file_id=' + file_id + "&block_offset=" + block_offset, ['soap', 'xmpp']);

            // blocks.onopen = function (event) {
            //     log('[**] Connected to server.');
            // };

            blocks.onmessage = function (event) {
                if (event.data.size != block_length) {
                    log('[!!] Block length is incorrect! Expected ' + block_length + ', but got ' + event.data.size);
                }
                file_blocks[block_offset] = event.data;
                server_pending_block = null;
            };

            // updates.onclose = function (event) {
            //     log('[**] Disconnected.');
            // };
            
            break;

        case 'error':
            log('[**] Error from server: ' + data.message);
            break;
        }
}

function send_message(msg) {
    msg = JSON.stringify(msg);
    log('C->S ' + msg);
    updates.send(msg);
}

$(document).ready(function() {
    $("#download").on('click', function() {
        // TODO: change later so it gets the fileid from the download link itself
        updates = new WebSocket('ws://' + server + '/updates/?fileid=' + file_id, ['soap', 'xmpp']);

        updates.onopen = function (event) {
            log('[**] Connected to server.');
        };

        updates.onmessage = function (event) {
            log('S->C ' + event.data);
            data = JSON.parse(event.data);
            handle_message(data);
        };

        updates.onclose = function (event) {
            log('[**] Disconnected.');
        };
    });
});

function send_offer(peer, user_id) {
    log("[**] Sending offer from " + my_user_id + " to  " + user_id);
    peer.user_id = user_id;
    peer.createOffer(function (offer) {
            peer.setLocalDescription(offer);
            send_message({type: "offer", offer: offer, remote_peer_id: peer.user_id});
        }, function(error) {
            alert("Could not create offer");
        }
    );
}

function handle_offer(offer, user_id) {
    log("[**] Receiving offer from " + user_id + " to " + my_user_id);
    if (!(user_id in peers_connections)) {
        peer = create_new_peer(user_id);
        if (users.indexOf(user_id) == -1) {
            log("[!!] No user is defined for the user_id!");
        }
        peers_connections[user_id] = peer;
    }
    else {
        peer = peers_connections[user_id];
    }
    peer.setRemoteDescription(new RTCSessionDescription(offer));

    peer.createAnswer(function (answer) {
        peer.setLocalDescription(answer);
        send_message({type:"answer", answer: answer, remote_peer_id: peer.user_id});
        }, function (error) {
            alert("Error creating answer");
        }
    );
}

function handle_answer(answer, user_id) {
    log("[**] Receiving answer from " + user_id + " to " + my_user_id);
    if (!(user_id in peers_connections)) {
        log("No peer associated with answer of user id: ", user_id);
        return;
    }
    peer = peers_connections[user_id];
    peer.setRemoteDescription(new RTCSessionDescription(answer));
}

function handle_candidate(candidate, user_id) {
    log("[**] Got ICE candidate for " + user_id);
    if (!(user_id in peers_connections)) {
        log("No peer associated with ICE candidate of user id: ", user_id);
        return;
    }

    peer = peers_connections[user_id];
    peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(function(error) {
        log("Error adding ICE candidate:", error);
    });
}
