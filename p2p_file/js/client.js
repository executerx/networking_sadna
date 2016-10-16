var server = "localhost:9090";
var name;
var connected_peer;

var conn = new WebSocket("ws://" + server);
var client_peer;
var data_channel;
var recv_ch;
var file;

var download_link = document.querySelector("#download");

file_input.addEventListener("change", create_download_link, null);

function send_server_message(message) {
    if (connected_peer) {
        message.name = connected_peer;
    }

    conn.send(JSON.stringify(message));
}

/*window.addEventListener('load', function () {

}, false);*/

conn.onmessage = function(msg) {
    var data = JSON.parse(msg.data);

    switch (data.type) {
        case "login":
            handle_login(data.success);
            break;
        case "offer":
            handle_offer(data.offer, data.name);
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
    name = make_random_id();
    send_server_message({type: "login", name: name});
};

function create_download_link(event) {
    var configuration = {
        "iceServers": [ { "url": "stun:stun2.1.google.com:19302"}]
    };

    file = event.target.files[0];

    client_peer = new RTCPeerConnection(); // configuration, {optional: [{RtpDataChannels: true}]});
    // client_peer = new RTCPeerConnection();
    client_peer.onicecandidate = function(event) { /* fired up when setLocalDescriptor is called */
        if (event.candidate) {
            console.log("CANDIDATE:", event.candidate);
            send_server_message({type:"candidate", candidate: event.candidate});
        }
    }

    client_peer.ondatachannel = function(event) {
        recv_ch = event.channel;
        recv_ch.onopen = function(event) {
        };
        recv_ch.onclose = function(event) {
        };
        recv_ch.onmessage = function(msg) {
            var reader = new window.FileReader();
            reader.onload = send_data_to_peer;
            reader.readAsText(file);
        }
    };

    data_channel = client_peer.createDataChannel("hosttoclient");
    data_channel.onopen = function(event) {
    };
    data_channel.onerror = function(error) {
    };

    data_channel.onmessage = function(event) {
    };

    data_channel.onclose = function() {
    };

    download_page = "/download.html";
    download_link.href = window.location.href.substring(0, window.location.href.lastIndexOf("/")) + download_page + "?peername=" + name;
    download_link.innerHTML = download_link.href;
}

conn.onerror = function(err) {
    console.log("Error received: ", err);
};

function handle_login(success) {
   if (success === false) {
       window.location = window.location.href; /* reload to regenerate new id? */
   } else {

   }
}

function handle_offer(offer, name) {
    connected_peer = name;
    client_peer.setRemoteDescription(new RTCSessionDescription(offer));

    client_peer.createAnswer(function (answer) {
        client_peer.setLocalDescription(answer);
        send_server_message({type:"answer", answer: answer});
    }, function (error) {
        alert("Error creating answer");
    });
}

function handle_candidate(candidate) {
    client_peer.addIceCandidate(new RTCIceCandidate(candidate)).catch(function(error) {
        console.log("shit son");
    });
}

var chunkLength = 1300;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function send_data_to_peer(event) {
    var data = {};
    text = event.target.result;
    if (event) text = event.target.result;
    /*
    data.last = true;
    data.message = text;

    data_channel.send(JSON.stringify(data)); // firefox
    */

    /* for chrome */
    for(var i = 0; i < text.length; i += chunkLength) {
        var chunk = text.slice(i, Math.min(text.length, i+chunkLength));
        data.message = chunk;
        data.last = false;
        if (i + chunkLength >= text.length) {
            data.last = true;
        }
        data_channel.send(JSON.stringify(data));
        // sleep(10);
    }
}