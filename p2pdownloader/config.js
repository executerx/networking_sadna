utils = require("./utils");

exports.files = {
    1337: {
        "filename": "blah.txt",
        "mime_type": "text/plain",
        "data": utils.divide_file_into_blocks(Buffer("pasten123456pasten123456"), 6),
        "block_size": 6,
        "max_bps": 1024
    },
    1234: {
        "filename": "chrome.jpg",
        "mime_type": "image/jpeg",
        "original_file": "data/why-chrome-eats-too-much-ram.jpg",
        "block_size": 1024,
        "max_bps": 1024*0.5
    },
    1001: {
        "filename": "great.py",
        "mime_type": "application/x-python",
        "original_file": "data/some_text_file",
        "block_size": 1024,
        "max_bps": 1024*0.5
    },
    1201: {
        "filename": "pentest_android.pdf",
        "mime_type": "application/pdf",
        "original_file": "data/pentest_android.pdf",
        "block_size": 1024*100,
        "max_bps": 1024*50
    }
};

exports.ice_servers = [
    {url:'stun:stun01.sipphone.com'},
    {url:'stun:stun.ekiga.net'},
    {url:'stun:stun.fwdnet.net'},
    {url:'stun:stun.ideasip.com'},
    {url:'stun:stun.iptel.org'},
    {url:'stun:stun.rixtelecom.se'},
    {url:'stun:stun.schlund.de'},
    {url:'stun:stun.l.google.com:19302'},
    {url:'stun:stun1.l.google.com:19302'},
    {url:'stun:stun2.l.google.com:19302'},
    {url:'stun:stun3.l.google.com:19302'},
    {url:'stun:stun4.l.google.com:19302'},
    {url:'stun:stunserver.org'},
    {url:'stun:stun.softjoys.com'},
    {url:'stun:stun.voiparound.com'},
    {url:'stun:stun.voipbuster.com'},
    {url:'stun:stun.voipstunt.com'},
    {url:'stun:stun.voxgratia.org'},
    {url:'stun:stun.xten.com'},
    {
        url: 'turn:numb.viagenie.ca',
        credential: 'muazkh',
        username: 'webrtc@live.com'
    },
    {
        url: 'turn:192.158.29.39:3478?transport=udp',
        credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
        username: '28224511:1379330808'
    },
    {
        url: 'turn:192.158.29.39:3478?transport=tcp',
        credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
        username: '28224511:1379330808'
    }
];

var crypto = require("./crypto");
exports.signing_keys = crypto.generate_keys();
