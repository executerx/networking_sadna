var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({port:9090});

var users = {};

function send_to(connection, message) {
    connection.send(JSON.stringify(message));
}

wss.on('connection', function(connection) {
    console.log('User connected...');

    connection.on('message', function(message) {
        var data;

        try {
            data = JSON.parse(message);
        } catch(e) {
            console.log("Could not parse JSON");
            data = {};
        }

        switch (data.type) {
            case "login":
                console.log("Login attempt:", data.name);

                if (users[data.name]) {
                    send_to(connection, {type:"login", success:false});
                    console.log("User already logged in.");
                } else {
                    users[data.name] = connection;
                    connection.name = data.name;

                    send_to(connection, {type:"login", success: true});
                    console.log("User authenticated.");
                }
                break;
            case "offer":
                console.log("Sending offer to: ", data.name, " from: ", connection.name);

                var conn = users[data.name];
                if (conn != null) {
                    connection.otherName = data.name;
                    send_to(conn, {type:"offer", offer:data.offer, name:connection.name});
                }
                break;

            case "answer":
                console.log("Sending answer to: ", data.name);

                var conn = users[data.name];

                if (conn != null) {
                    connection.otherName = data.name;
                    send_to(conn, {type:"answer", answer: data.answer});
                }
                break;

            case "candidate":
                console.log("Sending candidate to:", data.name);
                var conn = users[data.name];

                if (conn != null) {
                    send_to(conn, {type:"candidate", candidate: data.candidate});
                }
                break;

            case "leave":
                console.log("Disconnection from:", data.name);
                var conn = users[data.name];
                conn.otherName = null;

                if (conn != null) {
                    send_to(conn, {type: "leave"});
                }
                break;

            default:
                send_to(connection, {type:"error", message: "Command not found:" + data.type});
                break;
        }
    });

    connection.on("close", function() {
        if (connection.name) {
            delete users[connection.name];

            if (connection.otherName) {
                console.log("Disconnection from: ", connection.otherName);
                var conn = users[connection.otherName];
                conn.otherName = null;

                if (conn != null) {
                    send_to(conn, {type: "leave"});
                }
            }
        }
    });
});

