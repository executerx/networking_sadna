var server = "localhost:8081";
var broadcast_interval = 1000;

var updates = null;

var file_id = location.search.substr(1);
var id = null;
var users = null;
var block_size = null;
var peers_connections = {};
var file_blocks = {};
var blocks_timer = null;

var file_size = null;
var mime_type = null;
var filename = null;

var debug = null;

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

function broadcast_remaining_blocks() {
    needed_blocks = remaining_blocks();
    log("[**] Requesting remaining blocks: " + needed_blocks);
    if (needed_blocks.length > 0) {
        for (var user_id in peers_connections) {
            peer = peers_connections[user_id];
            if (peer.local_data_channel.readyState == "open") {
                peer.local_data_channel.send(JSON.stringify({type: "blocks_request", blocks_list: needed_blocks}));
            }
        }
        /* also, ask for the server */
        send_message(({type: 'fresh_block', remaining_blocks: needed_blocks}));
        setTimeout(broadcast_remaining_blocks, broadcast_interval);
    }
}

function initialize_blocks_data_channel(event) {
    blocks_data_channel = event.channel;
    blocks_data_channel.next_is_data = false;

    blocks_data_channel.onopen = function(ev) {
        log("[**] Blocks data channel has opened.");
    };
    blocks_data_channel.onerror = function(error) {
        log("[!!] Error on blocks data channel:", error);
    };

    blocks_data_channel.onmessage = function(msg) {
        if (this.next_is_data) {
            log("[**] Got a data block data from a peer");
            this.next_is_data = false;
            file_blocks[this.next_block_offset] = new Blob([msg.data]);
            return;
        }

        try {
            data = JSON.parse(msg.data);
        } catch (e) {
            log("[!!] Malformed message sent in block data channel.");
            return;
        }

        // parse data being a list of needed blocks or rather a new block
        switch (data.type) {
            case "blocks_request":
                log("R->L Receiving block message from peer.");
                user_missing_blocks_list = data.blocks_list;

                /* intersect user needed blocks list with our blocks in possesion */
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
                blocks_offsets_in_stock = [];
                for(var b in file_blocks) { /* turn this crap into one-liner */
                    blocks_offsets_in_stock.push(b);
                }
                blocks_for_user = get_intersection(user_missing_blocks_list, blocks_offsets_in_stock);
                if (blocks_for_user.length > 0) { /* if we can satisfy peer with a block */
                    block_offset = blocks_for_user[Math.floor((Math.random() * blocks_for_user.length))]; /* pick one at random */
                    log("L->R Sending block at offset " + block_offset + " for peer");
                    this.channel.send(JSON.stringify({type: "data_block", block_offset: block_offset}));

                    var fileReader = new FileReader();
                    fileReader.onload = function() {
                        blocks_data_channel.send(this.result);
                    };
                    fileReader.readAsArrayBuffer(file_blocks[block_offset]);
                }

                break;

            case "data_block":
                log("R->L Received block at offset " + data.block_offset + " from peer");
                this.next_block_offset = data.block_offset;

                /* override existing if there's any */
                this.next_is_data = true;
                /* can compute if finished reading file but interval will be called anyways and will clear timer... */
                break;

            default:
                break;
        }
    }.bind({channel: blocks_data_channel});

    blocks_data_channel.onclose = function() {
        log("[**] Blocks data channel has closed.");
    };

    return blocks_data_channel;
}
/*var reader = new window.FileReader();
reader.onload = send_data_to_peer;
reader.readAsText(file);*/

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
    peer.user_id = user_id;
    peer.onicecandidate = ice_candidate_ready.bind({user_id:user_id}); /* fired up when setLocalDescriptor is called */

    data_channel = peer.createDataChannel("seedchannel");
    data_channel.binaryType = "arraybuffer"; 

    data_channel = initialize_blocks_data_channel({channel: data_channel});
    peer.ondatachannel = initialize_blocks_data_channel;
    peer.local_data_channel = data_channel;

    return peer;
}

function handle_message(data) {
    switch (data.type) {
        case 'hello':
            id = data.id;
            users = data.users;
            block_size = data.block_size;
            file_size = data.file_size;
            mime_type = data.mime_type;
            filename = data.filename

            for (var idx in users) {
                user_id = users[idx];
                if (user_id != id) {
                    peer = create_new_peer(user_id);
                    peers_connections[user_id] = peer;

                    send_offer(peer, user_id); // request to peer with remote user
                }
            }

            send_message({type: 'fresh_block', remaining_blocks: remaining_blocks()});
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
    log("[**] Sending offer from " + id + " to  " + user_id);
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
    log("[**] Receiving offer from " + user_id + " to " + id);
    if (!(user_id in peers_connections)) {
        peer = create_new_peer(user_id);
        users.push(user_id); /* maybe remove later and think of a more clever way */
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
    log("[**] Receiving answer from " + user_id + " to " + id);
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
