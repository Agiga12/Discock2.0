const socket = io();
let localStream, screenStream;
const peers = {};
const remoteStreams = {};
const gainNodes = {}; // Храним контроллеры громкости по sid
let audioCtx;

const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function joinRoom() {
    const room = document.getElementById('roomInput').value;
    const nickname = document.getElementById('nicknameInput').value;
    const avatar = document.getElementById('avatarInput').value || 'https://www.gravatar.com/avatar/?d=mp';
    
    // Инициализируем аудио контекст после клика
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        socket.emit('join', { room, nickname, avatar });
    } catch (err) { alert("Ошибка микрофона"); }
}

// Показ меню громкости при правом клике
function showVolumeMenu(e, sid, nickname) {
    e.preventDefault();
    const menu = document.getElementById('volumeMenu');
    const slider = document.getElementById('volumeSlider');
    const valText = document.getElementById('volVal');
    const nameText = document.getElementById('volName');

    nameText.innerText = nickname;
    menu.style.display = 'block';
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;

    // Устанавливаем текущее значение слайдера
    const currentGain = gainNodes[sid] ? gainNodes[sid].gain.value * 100 : 100;
    slider.value = currentGain;
    valText.innerText = `${Math.round(currentGain)}%`;

    // Обработка изменения слайдера
    slider.oninput = (event) => {
        const val = event.target.value;
        valText.innerText = `${val}%`;
        if (gainNodes[sid]) {
            // Web Audio API: 100% = 1.0, 200% = 2.0
            gainNodes[sid].gain.setTargetAtTime(val / 100, audioCtx.currentTime, 0.01);
        }
    };
    
    e.stopPropagation(); // Чтобы основной обработчик клика окна не закрыл меню сразу
}

socket.on('update-user-list', (data) => {
    const list = document.getElementById('userList');
    list.innerHTML = '';
    data.users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-card';
        // Вешаем событие правого клика
        div.oncontextmenu = (e) => showVolumeMenu(e, u.sid, u.nickname);
        
        let watchBtn = u.is_sharing && u.sid !== socket.id ? `<button class="watch-btn" onclick="watchStream('${u.sid}')">📺 Смотреть</button>` : '';
        div.innerHTML = `<img src="${u.avatar}" class="avatar" onerror="this.src='https://www.gravatar.com/avatar/?d=mp'"><span class="user-name">${u.nickname}</span> ${watchBtn}`;
        list.appendChild(div);
    });
});

function createPeerConnection(sid) {
    const pc = new RTCPeerConnection(iceConfig);
    peers[sid] = pc;
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.ontrack = (event) => {
        if (event.track.kind === 'video') {
            remoteStreams[sid] = event.streams[0];
        } else {
            // WEB AUDIO API ДЛЯ ГРОМКОСТИ 200%
            const stream = event.streams[0];
            const source = audioCtx.createMediaStreamSource(stream);
            const gainNode = audioCtx.createGain();
            
            source.connect(gainNode).connect(audioCtx.destination);
            gainNodes[sid] = gainNode;
            
            // Также создаем невидимый аудио элемент для корректной работы WebRTC
            let audio = document.createElement('audio');
            audio.id = `audio-${sid}`;
            audio.srcObject = stream;
            audio.muted = true; // Звук идет через GainNode, поэтому элемент мутим
            document.getElementById('remoteAudios').appendChild(audio);
        }
    };
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('signal', { to: sid, signal: e.candidate }); };
    return pc;
}

// --- Остальные функции (toggleScreenShare, watchStream, signal и т.д.) остаются прежними ---

async function toggleScreenShare() {
    const btn = document.getElementById('screenBtn');
    if (!screenStream) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            btn.innerText = "Остановить трансляцию";
            btn.style.background = "#da373c";
            socket.emit('share-state', { isSharing: true });
            const videoTrack = screenStream.getVideoTracks()[0];
            for (let sid in peers) {
                peers[sid].addTrack(videoTrack, screenStream);
                const offer = await peers[sid].createOffer();
                await peers[sid].setLocalDescription(offer);
                socket.emit('signal', { to: sid, signal: offer });
            }
            videoTrack.onended = () => toggleScreenShare();
        } catch (e) { console.error(e); }
    } else {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
        btn.innerText = "Транслировать экран";
        btn.style.background = "#43b581";
        socket.emit('share-state', { isSharing: false });
    }
}

function watchStream(sid) {
    const theater = document.getElementById('theater');
    const video = document.getElementById('mainVideo');
    if (remoteStreams[sid]) {
        theater.style.display = 'flex';
        video.srcObject = remoteStreams[sid];
    }
}

function closeTheater() {
    document.getElementById('theater').style.display = 'none';
    document.getElementById('mainVideo').srcObject = null;
}

socket.on('user-connected', async (data) => {
    const pc = createPeerConnection(data.sid);
    if (screenStream) screenStream.getVideoTracks().forEach(track => pc.addTrack(track, screenStream));
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

function leaveRoom() {
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    socket.emit('leave_room_custom', { room: document.getElementById('roomInput').value });
    for (let s in peers) { peers[s].close(); delete peers[s]; }
    for (let s in gainNodes) delete gainNodes[s];
    if (localStream) localStream.getTracks().forEach(t => t.stop());
}
