const socket = io();
let localStream;
const peers = {};

// Тот самый простой конфиг, который работал изначально
const iceConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

async function joinRoom() {
    const room = document.getElementById('roomInput').value;
    const nickname = document.getElementById('nicknameInput').value;
    const avatar = document.getElementById('avatarInput').value || 'https://www.gravatar.com/avatar/?d=mp';
    
    if (!room || !nickname) {
        alert("Введите никнейм и название комнаты!");
        return;
    }

    try {
        // Захват микрофона
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Микрофон получен"); // Лог как на твоем первом скриншоте
        
        // Вход в комнату
        socket.emit('join', { room: room, nickname: nickname, avatar: avatar });
        
        // Переключение интерфейса
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('roomUI').style.display = 'block';
        document.getElementById('displayRoomName').innerText = room;

    } catch (err) {
        console.error(err);
        alert("Без доступа к микрофону чат не будет работать!");
    }
}

// ФУНКЦИЯ ВЫХОДА (возвращает к форме с сохранением данных)
function leaveRoom() {
    const room = document.getElementById('roomInput').value;
    socket.emit('leave_room_custom', { room: room });

    for (let sid in peers) {
        if (peers[sid]) {
            peers[sid].close();
            delete peers[sid];
        }
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }

    document.getElementById('roomUI').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
}

// ОБНОВЛЕНИЕ СПИСКА (Круглые аватарки в столбик)
socket.on('update-user-list', (data) => {
    const userList = document.getElementById('userList');
    userList.innerHTML = ''; 
    
    data.users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-card';
        div.innerHTML = `
            <img src="${user.avatar}" class="avatar" onerror="this.src='https://www.gravatar.com/avatar/?d=mp'">
            <span class="user-name">${user.nickname}</span>
        `;
        userList.appendChild(div);
    });
});

// СТАНДАРТНАЯ ЛОГИКА WebRTC
socket.on('user-connected', async (data) => {
    console.log("Новый пользователь подключился:", data.sid);
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

    pc.ontrack = (event) => {
        console.log("Получен аудиопоток от", sid);
        let audio = document.getElementById(`audio-${sid}`);
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = `audio-${sid}`;
            audio.autoplay = true;
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
