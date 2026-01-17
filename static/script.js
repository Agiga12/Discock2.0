const socket = io();
let localStream;
const peers = {};

// Твой проверенный конфиг с личными ключами Metered
const iceConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
            urls: [
                'turn:global.metered.ca:80',
                'turn:global.metered.ca:443'
            ],
            username: '363054d6294d86ed2f279542',
            credential: '25oVFuUTlV+m/KcI'
        }
    ]
};

async function joinRoom() {
    const room = document.getElementById('roomInput').value;
    const nickname = document.getElementById('nicknameInput').value;
    
    if (!room || !nickname) {
        alert("Введите никнейм и название комнаты!");
        return;
    }

    try {
        // Захват микрофона
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Микрофон готов");
        
        // Отправляем данные на сервер (теперь с никнеймом)
        socket.emit('join', { room: room, nickname: nickname });
        
        // UI: Переключаем экраны (плавный переход)
        const loginForm = document.getElementById('loginForm');
        const roomUI = document.getElementById('roomUI');
        
        loginForm.style.opacity = '0';
        setTimeout(() => {
            loginForm.style.display = 'none';
            roomUI.style.display = 'block';
            document.getElementById('displayRoomName').innerText = room;
        }, 300);

    } catch (err) {
        console.error(err);
        alert("Без доступа к микрофону чат не будет работать!");
    }
}

// ОБНОВЛЕНИЕ СПИСКА УЧАСТНИКОВ
socket.on('update-user-list', (data) => {
    const userList = document.getElementById('userList');
    userList.innerHTML = ''; // Очищаем старый список
    
    data.users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'user-item';
        item.innerHTML = `
            <div class="status-indicator"></div>
            <span class="user-name">${user}</span>
        `;
        userList.appendChild(item);
    });
});

// ЛОГИКА WebRTC (Сигналинг)
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
        audio.play().catch(() => console.log("Нужен клик для звука"));
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('signal', { to: sid, signal: event.candidate });
        }
    };

    return pc;
}
