var server = "localhost";

var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
};

function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
        return entityMap[s];
    });
}

$(document).ready(function() {
    var connection = new WebSocket('ws://'+server+'/updates', ['soap', 'xmpp']);

    connection.onopen = function (event) {
        msg = JSON.stringify({test: 'message'});
        connection.send(msg);
        $('#console').append("C->S: " + escapeHtml(msg) + "<br />");
    };

    connection.onmessage = function (event) {
        $('#console').append("S->C: " + escapeHtml(event.data) + "<br />");
    }
});
