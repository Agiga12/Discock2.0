const socket = io();
let localStream;
const peers = {};

async function joinRoom() {
    const room = document.getElementById('roomInput').value;
    if (!room) return;

    try {
        // Запрашиваем микрофон ПЕРЕД подключением к комнате
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Микрофон получен");
        
        socket.emit('join', { room: room });
        document.getElementById('status').innerText = `Подключено к: ${room}`;
    } catch (err) {
        console.error("Ошибка доступа к микрофону:", err);
        alert("Не удалось получить доступ к микрофону!");
    }
}

// Когда нам говорят, что кто-то зашел
socket.on('user-connected', async (data) => {
    console.log("Новый пользователь подключился:", data.sid);
    const pc = createPeerConnection(data.sid);
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('signal', {
        to: data.sid,
        signal: offer
    });
});

// Получение сигнала (оффер, ответ или ICE-кандидат)
socket.on('signal', async (data) => {
    let pc = peers[data.sid];
    
    if (!pc) {
        pc = createPeerConnection(data.sid);
    }

    if (data.signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: data.sid, signal: answer });
    } else if (data.signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
    } else if (data.signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.signal));
    }
});

function createPeerConnection(sid) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peers[sid] = pc;

    // Добавляем дорожки нашего микрофона в соединение
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // Обработка входящего звука
    pc.ontrack = (event) => {
        console.log("Получен аудиопоток от", sid);
        let audio = document.getElementById(`audio-${sid}`);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = `audio-${sid}`;
            audio.autoplay = true;
            // Важно для некоторых мобильных браузеров
            audio.playsInline = true; 
            document.getElementById('remoteAudios').appendChild(audio);
        }
        audio.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { to: sid, signal: event.candidate });
        }
    };

    return pc;
}