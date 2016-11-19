var rs = require('jsrsasign');

function digest(sig, block_data, offset) {
    sig.updateString(offset.toString() + "|");
    sig.updateHex(block_data.toString("hex"));
}

exports.sign = function(prvKey, block_data, offset) {
    var sig = new rs.Signature({alg: 'SHA256withRSA'});
    sig.init(prvKey);
    digest(sig, block_data, offset);
    return sig.sign();
}

/* Not used, just for completeness */
exports.verify = function(pubKey, block_data, offset, signature) {
    var sig = new rs.Signature({alg: 'SHA256withRSA'});
    sig.init(pubKey);
    digest(sig, block_data, offset);
    return sig.verify(signature);
}

exports.generate_keys = function() {
    console.log("[*] Generating key...")
    rsaKeypair = rs.KEYUTIL.generateKeypair("RSA", 2048);
    console.log("    Done.");

    return rsaKeypair;
}

exports.jsonify_key = function(key) {
    return  rs.KEYUTIL.getJWKFromKey(key);
}
