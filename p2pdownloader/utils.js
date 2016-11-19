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

exports.divide_file_into_blocks = function(file_data, block_size) {
    blocks = {};
    for (var b = 0; b < file_data.length; b += block_size) {
        blocks[b] = file_data.slice(b, b+block_size);
    }

    return blocks;
}
