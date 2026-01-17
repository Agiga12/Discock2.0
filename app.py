import os
from flask import Flask, render_template
from flask_socketio import SocketIO, join_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def on_join(data):
    room = data['room']
    join_room(room)
    emit('user-connected', {'userId': data['userId']}, room=room, include_self=False)

@socketio.on('signal')
def on_signal(data):
    emit('signal', data, room=data['to'])

if __name__ == '__main__':
    # Render передает порт через переменную окружения
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)