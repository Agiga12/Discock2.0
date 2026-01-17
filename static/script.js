const socket = io();
let localStream;
const peers = {};

// ТВОЙ НОВЫЙ СТОПУДОВЫЙ КОНФИГ С ЛИЧНЫМИ КЛЮЧАМИ
const iceConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            // Личные данные из твоего кабинета Metered
            urls: [
                'turn:global.metered.ca:80',
                'turn:global.metered.ca:443',
                'turn:global.metered.ca:443?transport=tcp'
            ],
            username: '363054d6294d86ed2f279542',
            credential: '25oVFuUTlV+m/KcI'
        }
    ]
};

async function joinRoom() {
    const room = document.getElementById('roomInput').value;
    if (!room) return;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Микрофон готов");
        
        socket.emit('join', { room: room });
        document.getElementById('status').innerText = `Комната: ${room}. Ждем друзей...`;
    } catch (err) {
        alert("Без микрофона чат не заработает!");
    }
}

socket.on('user-connected', async (data) => {
    console.log("Новый участник:", data.sid);
    const pc = createPeerConnection(data.sid);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { to: data.sid, signal: offer });
});

socket.on('signal', async (data) => {
    let pc = peers[data.sid] || createPeerConnection(data.sid);

    if (data.signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: data.sid, signal: answer });
    } else if (data.signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.candidate) {
        pc.addIceCandidate(new RTCIceCandidate(data.signal)).catch(e => console.error(e));
    }
});

function createPeerConnection(sid) {
    const pc = new RTCPeerConnection(iceConfig);
    peers[sid] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Следим за качеством связи
    pc.oniceconnectionstatechange = () => {
        console.log(`Связь с ${sid}: ${pc.iceConnectionState}`);
    };

    pc.ontrack = (event) => {
        let audio = document.getElementById(`audio-${sid}`);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = `audio-${sid}`;
            audio.autoplay = true;
            audio.playsInline = true; 
            document.getElementById('remoteAudios').appendChild(audio);
        }
        audio.srcObject = event.streams[0];
        // Принудительный запуск звука (фикс для мобилок и Safari)
        audio.play().catch(() => console.log("Нужен клик для звука"));
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { to: sid, signal: event.candidate });
        }
    };

    return pc;
}
