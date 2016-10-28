exports.make_random_id = function () {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for( var i=0; i < 10; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
};

exports.pack = function (message) {
    return JSON.stringify(message);
};

exports.unpack = function (message) {
    return JSON.parse(message);
};

exports.readFile = function(filename) {
    fs = require('fs');
    return fs.readFileSync(filename);
};
