import os
from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# sid: {'nickname': str, 'avatar': str, 'room': str, 'is_sharing': bool}
users = {}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def on_join(data):
    room = data['room']
    nickname = data.get('nickname', 'Аноним')
    avatar = data.get('avatar', '')
    join_room(room)
    users[request.sid] = {'nickname': nickname, 'avatar': avatar, 'room': room, 'is_sharing': False}
    send_update_list(room)
    emit('user-connected', {'sid': request.sid}, room=room, include_self=False)

@socketio.on('share-state')
def on_share_state(data):
    if request.sid in users:
        users[request.sid]['is_sharing'] = data['isSharing']
        send_update_list(users[request.sid]['room'])

def send_update_list(room):
    room_users = [{'sid': sid, 'nickname': u['nickname'], 'avatar': u['avatar'], 'is_sharing': u['is_sharing']} 
                  for sid, u in users.items() if u['room'] == room]
    socketio.emit('update-user-list', {'users': room_users}, room=room)

@socketio.on('leave_room_custom')
def on_leave(data):
    leave_room(data['room'])
    users.pop(request.sid, None)
    send_update_list(data['room'])

@socketio.on('disconnect')
def on_disconnect():
    if request.sid in users:
        room = users[request.sid]['room']
        users.pop(request.sid, None)
        send_update_list(room)

@socketio.on('signal')
def on_signal(data):
    emit('signal', {'sid': request.sid, 'signal': data['signal']}, room=data['to'])

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)
