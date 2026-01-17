import os
from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# Хранилище: {sid: {'nickname': str, 'avatar': str, 'room': str}}
users = {}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def on_join(data):
    room = data['room']
    nickname = data.get('nickname', 'Аноним')
    avatar = data.get('avatar', 'https://via.placeholder.com/150')
    
    join_room(room)
    users[request.sid] = {'nickname': nickname, 'avatar': avatar, 'room': room}
    
    # Рассылаем список участников с аватарками
    room_users = [{'nickname': u['nickname'], 'avatar': u['avatar']} for sid, u in users.items() if u['room'] == room]
    emit('update-user-list', {'users': room_users, 'roomName': room}, room=room)
    
    emit('user-connected', {'sid': request.sid}, room=room, include_self=False)

@socketio.on('leave_room_custom')
def on_leave(data):
    room = data['room']
    leave_room(room)
    if request.sid in users:
        del users[request.sid]
    
    room_users = [{'nickname': u['nickname'], 'avatar': u['avatar']} for sid, u in users.items() if u['room'] == room]
    emit('update-user-list', {'users': room_users, 'roomName': room}, room=room)

@socketio.on('disconnect')
def on_disconnect():
    if request.sid in users:
        room = users[request.sid]['room']
        del users[request.sid]
        room_users = [{'nickname': u['nickname'], 'avatar': u['avatar']} for sid, u in users.items() if u['room'] == room]
        emit('update-user-list', {'users': room_users, 'roomName': room}, room=room)

@socketio.on('signal')
def on_signal(data):
    emit('signal', {'sid': request.sid, 'signal': data['signal']}, room=data['to'])

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)
