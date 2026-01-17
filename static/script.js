const socket = io();
const myId = Math.random().toString(36).substr(2, 9);
let localStream;
const peers = {};

async function joinRoom() {
    const room = document.getElementById('roomInput').value;
    if (!room) return;

    // Запрашиваем доступ к микрофону
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    socket.emit('join', { room: room, userId: myId });
    document.getElementById('status').innerText = `Подключено к: ${room}`;
}

socket.on('user-connected', async (data) => {
    const peerConnection = createPeerConnection(data.userId);
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    socket.emit('signal', {
        to: data.userId,
        from: myId,
        signal: offer
    });
});

socket.on('signal', async (data) => {
    let peerConnection = peers[data.from];
    
    if (!peerConnection) {
        peerConnection = createPeerConnection(data.from);
    }

    if (data.signal.type === 'offer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { to: data.from, from: myId, signal: answer });
    } else if (data.signal.type === 'answer') {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal));
    }
});

function createPeerConnection(userId) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peers[userId] = pc;

    // Добавляем наш микрофон в поток
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Когда получаем звук от другого человека
    pc.ontrack = (event) => {
        let audio = document.getElementById(`audio-${userId}`);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = `audio-${userId}`;
            audio.autoplay = true;
            document.getElementById('remoteAudios').appendChild(audio);
        }
        audio.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { to: userId, from: myId, signal: event.candidate });
        }
    };

    return pc;
}