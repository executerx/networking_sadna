var server = "localhost:9090";
var name;
var connected_peer;

var conn = new WebSocket("ws://" + server);
var client_peer;
var data_channel;
var recv_ch;

var start_button = document.querySelector("#startBtn");

start_button.addEventListener("click", function() {
    data_channel.send("#!START#!");
});

function get_param_by_name(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

// var download_id = get_param_by_name('download_id', null);
var peer_name = get_param_by_name('peername', null);
var username = get_param_by_name('username', null); // heavy security restrictions
if (!peer_name) {
    document.write("No peer supplied");
    // bail here
}

conn.onmessage = function(msg) {
    console.log("Got message", msg.data);

    var data = JSON.parse(msg.data);

    switch (data.type) {
        case "login":
            handle_login(data.success);
            break;
        case "answer":
            handle_answer(data.answer);
            break;
        case "candidate":
            handle_candidate(data.candidate);
            break;
        case "leave":
            handle_leave();
            break;
        default:
            break;
    }
};

conn.onopen = function() {
    var username = make_random_id();
    send_server_message({type: "login", name: username});
};

conn.onerror = function(err) {
    console.log("Error received: ", err);
};

/*window.addEventListener('load', function () {

}, false);*/

function send_server_message(message) {
    if (connected_peer) {
        message.name = connected_peer;
    }

    conn.send(JSON.stringify(message));
}

function handle_answer(answer) {
    console.log(client_peer.setRemoteDescription(new RTCSessionDescription(answer)));
}

function handle_candidate(candidate) {
    client_peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(function(error) {
        console.log(error);
    });
}

function saveToDisk(text, file_name) {
    var blob = new Blob([text], {type: "text/plain;"});
    saveAs(blob, file_name);
}

var arrayToStoreChunks = [];
function handle_login(success) {
    if (success === false) {
        alert("Username already used.");
        name = '';
    } else {
        /*var configuration = {
            "iceServers": [ { "url": "stun:stun2.1.google.com:19302"}]
        };*/

        client_peer = new RTCPeerConnection();
        client_peer.onicecandidate = function(event) { /* fired up when setLocalDescriptor is called */
            if (event.candidate) {
                send_server_message({type:"candidate", candidate: event.candidate});
            }
        };
        data_channel = client_peer.createDataChannel("clienttohost");
        client_peer.ondatachannel = function(event) {
            recv_ch = event.channel;
            recv_ch.onopen = function(event) {

            };
            recv_ch.onclose = function(event) {

            };
            recv_ch.onmessage = function(event) {
                var data = JSON.parse(event.data);
                 arrayToStoreChunks.push(data.message);
                 if (data.last) {
                     saveToDisk(arrayToStoreChunks.join(''), 'add_support_for_filenames_later_on');
                     arrayToStoreChunks = [];
                 }
            };
        };
        data_channel.onopen = function(event) {
        };
        data_channel.onerror = function(error) {
        };

        data_channel.onmessage = function(event) {
        };

        data_channel.onclose = function() {
        };

        client_peer.createOffer(function (offer) {
                connected_peer = peer_name;

                client_peer.setLocalDescription(offer);
                send_server_message({type: "offer", offer: offer});
            }, function(error) {
                alert("Could not create offer");
            }
        );
    }
}

