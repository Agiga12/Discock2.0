import os
from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
# Важно для работы WebRTC
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def on_join(data):
    room = data['room']
    join_room(room)
    # Отправляем остальным в комнате системный SID нового пользователя
    emit('user-connected', {'sid': request.sid}, room=room, include_self=False)

@socketio.on('signal')
def on_signal(data):
    # Пересылаем сигнал конкретному пользователю по его SID
    # data['to'] теперь содержит системный SID получателя
    emit('signal', {'sid': request.sid, 'signal': data['signal']}, room=data['to'])

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)