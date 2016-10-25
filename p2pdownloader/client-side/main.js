var server = "localhost:8081";

var updates = null;

var id = null;
var users = null;
var block_size = null;
var peers_connections = {};
var blocks_earned = null;

var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
};

function initialize_blocks_data_channel(event) {
    blocks_data_channel = event.channel;
    blocks_data_channel.onopen = function(ev) {
        log("Blocks data channel has opened.");
    };
    blocks_data_channel.onerror = function(error) {
        log("Error on blocks data channel:", error);
    };

    blocks_data_channel.onmessage = function(msg) {
        log("Receiving block message from peer.");
        try {
            data = JSON.parse(msg);
        } catch (e) {
            log("Malformed message sent in block data channel.");
        }

        // parse data being a list of needed blocks or rather a new block

    };

    blocks_data_channel.onclose = function() {
        log("Blocks data channel has closed.");
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
    log("Initializing new peer object.");
    peer = new RTCPeerConnection();
    peer.user_id = user_id;
    peer.onicecandidate = ice_candidate_ready.bind({user_id:user_id}); /* fired up when setLocalDescriptor is called */

    data_channel = peer.createDataChannel("seedchannel");
    data_channel = initialize_blocks_data_channel({channel: data_channel});
    peer.ondatachannel = initialize_blocks_data_channel;

    return peer;
}

function handle_message(data) {
    switch (data.type) {
        case 'hello':
            id = data.id;
            users = data.users;
            block_size = data.block_size;

            for (var idx in users) {
                user_id = users[idx];
                if (user_id != id) {
                    peer = create_new_peer(user_id);
                    peers_connections[user_id] = peer;

                    send_offer(peer, user_id); // request to peer with remote user
                }
            }

            send_message({type: 'fresh_block'});
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
    $("#download").on('click', function() {
        updates = new WebSocket('ws://' + server + '/updates', ['soap', 'xmpp']);

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
    log("Sending offer from " + id + " to  " + user_id);
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
    log("Receiving offer from " + user_id + " to " + id);
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
    log("Receiving answer from " + user_id + " to " + id);
    if (!(user_id in peers_connections)) {
        log("No peer associated with answer of user id: ", user_id);
        return;
    }
    peer = peers_connections[user_id];
    peer.setRemoteDescription(new RTCSessionDescription(answer));
}

function handle_candidate(candidate, user_id) {
    log("Got ICE candidate for " + user_id);
    if (!(user_id in peers_connections)) {
        log("No peer associated with ICE candidate of user id: ", user_id);
        return;
    }

    peer = peers_connections[user_id];
    peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(function(error) {
        log("Error adding ICE candidate:", error);
    });
}
