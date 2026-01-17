const socket = io();
let localStream;
let screenStream;
const peers = {};

const iceConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

async function joinRoom() {
    const room = document.getElementById('roomInput').value;
    const nickname = document.getElementById('nicknameInput').value;
    const avatar = document.getElementById('avatarInput').value || 'https://www.gravatar.com/avatar/?d=mp';

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        socket.emit('join', { room, nickname, avatar });
    } catch (err) {
        alert("Нужен микрофон!");
    }
}

async function toggleScreenShare() {
    const btn = document.getElementById('screenBtn');
    
    if (!screenStream) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            btn.innerText = "Остановить трансляцию";
            btn.style.background = "#da373c";

            const videoTrack = screenStream.getVideoTracks()[0];
            
            // Добавляем видео всем подключенным пирам
            for (let sid in peers) {
                peers[sid].addTrack(videoTrack, screenStream);
                // Пересогласовываем связь
                const offer = await peers[sid].createOffer();
                await peers[sid].setLocalDescription(offer);
                socket.emit('signal', { to: sid, signal: offer });
            }

            videoTrack.onended = () => stopScreenShare();
        } catch (err) { console.error(err); }
    } else {
        stopScreenShare();
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    const btn = document.getElementById('screenBtn');
    btn.innerText = "Транслировать экран";
    btn.style.background = "#43b581";
    // Чтобы полностью убрать видео у других, проще перезайти в комнату 
    // или реализовать удаление трека (для упрощения оставим так)
}

function leaveRoom() {
    stopScreenShare();
    socket.emit('leave_room_custom', { room: document.getElementById('roomInput').value });
    for (let sid in peers) { peers[sid].close(); delete peers[sid]; }
    if (localStream) localStream.getTracks().forEach(t => t.stop());
}

socket.on('update-user-list', (data) => {
    const list = document.getElementById('userList');
    list.innerHTML = '';
    data.users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-card';
        div.innerHTML = `<img src="${u.avatar}" class="avatar" onerror="this.src='https://www.gravatar.com/avatar/?d=mp'"><span class="user-name">${u.nickname}</span>`;
        list.appendChild(div);
    });
});

socket.on('user-connected', async (data) => {
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
        pc.addIceCandidate(new RTCIceCandidate(data.signal)).catch(e => {});
    }
});

function createPeerConnection(sid) {
    const pc = new RTCPeerConnection(iceConfig);
    peers[sid] = pc;

    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.ontrack = (event) => {
        if (event.track.kind === 'video') {
            let video = document.getElementById(`video-${sid}`);
            if (!video) {
                video = document.createElement('video');
                video.id = `video-${sid}`;
                video.autoplay = true;
                video.playsInline = true;
                document.getElementById('videoGrid').appendChild(video);
            }
            video.srcObject = event.streams[0];
        } else {
            let audio = document.getElementById(`audio-${sid}`) || document.createElement('audio');
            audio.id = `audio-${sid}`;
            audio.autoplay = true;
            audio.srcObject = event.streams[0];
            document.getElementById('remoteAudios').appendChild(audio);
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) socket.emit('signal', { to: sid, signal: event.candidate });
    };

    return pc;
}
