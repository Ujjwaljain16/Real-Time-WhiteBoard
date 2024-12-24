// Add this to your existing JavaScript, just before the Whiteboard class

class WhiteboardConnection {
    constructor(roomId, username) {
        this.roomId = roomId;
        this.username = username;
        this.ws = new WebSocket('ws://localhost:8080');
        this.onDrawCallback = null;
        this.onParticipantCallback = null;
        this.onChatCallback = null;
        
        this.setupWebSocket();
    }

    setupWebSocket() {
        this.ws.onopen = () => {
            console.log('Connected to server');
            this.joinRoom();
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch(data.type) {
                case 'draw':
                    if (this.onDrawCallback) {
                        this.onDrawCallback(data.drawData);
                    }
                    break;
                    
                case 'participant_joined':
                case 'participant_left':
                case 'current_participants':
                    if (this.onParticipantCallback) {
                        this.onParticipantCallback(data);
                    }
                    break;
                    
                case 'chat':
                    if (this.onChatCallback) {
                        this.onChatCallback(data);
                    }
                    break;
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from server');
            // Attempt to reconnect after 5 seconds
            setTimeout(() => this.setupWebSocket(), 5000);
        };
    }

    joinRoom() {
        this.send({
            type: 'join',
            roomId: this.roomId,
            name: this.username
        });
    }

    sendDraw(drawData) {
        this.send({
            type: 'draw',
            drawData: drawData
        });
    }

    sendChat(message) {
        this.send({
            type: 'chat',
            name: this.username,
            message: message
        });
    }

    send(data) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
}

// Modify the initialization code at the bottom of your HTML:

document.addEventListener('DOMContentLoaded', () => {
    // Show join form
    const joinForm = document.createElement('div');
    joinForm.innerHTML = `
        <div id="joinForm" style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;">
            <div style="background: white; padding: 2rem; border-radius: 8px; width: 300px;">
                <h2>Join Whiteboard</h2>
                <input type="text" id="username" placeholder="Your Name" style="width: 100%; margin: 1rem 0; padding: 0.5rem;">
                <input type="text" id="roomId" placeholder="Room ID" style="width: 100%; margin: 1rem 0; padding: 0.5rem;">
                <button id="joinBtn" style="width: 100%; padding: 0.5rem; background: #0066ff; color: white; border: none; border-radius: 4px; cursor: pointer;">Join</button>
            </div>
        </div>
    `;
    document.body.appendChild(joinForm);

    document.getElementById('joinBtn').addEventListener('click', () => {
        const username = document.getElementById('username').value.trim();
        const roomId = document.getElementById('roomId').value.trim();
        
        if (username && roomId) {
            // Initialize whiteboard with real-time connection
            const whiteboard = new Whiteboard();
            const chat = new Chat();
            
            const connection = new WhiteboardConnection(roomId, username);
            
            // Handle incoming draws
            connection.onDrawCallback = (drawData) => {
                whiteboard.receiveDraw(drawData);
            };
            
            // Handle participant updates
            connection.onParticipantCallback = (data) => {
                if (data.type === 'participant_joined') {
                    chat.addMessage('System', `${data.name} joined the room`);
                    mockNewParticipant(data.name);
                } else if (data.type === 'participant_left') {
                    chat.addMessage('System', 'A participant left the room');
                }
            };
            
            // Handle chat messages
            connection.onChatCallback = (data) => {
                chat.addMessage(data.name, data.message);
            };
            
            // Modify whiteboard's broadcast method to use WebSocket
            whiteboard.broadcastDraw = (data) => {
                connection.sendDraw(data);
            };
            
            // Modify chat's send method to use WebSocket
            const originalSendMessage = chat.sendMessage;
            chat.sendMessage = function() {
                const message = this.input.value.trim();
                if (message) {
                    connection.sendChat(message);
                    originalSendMessage.call(this);
                }
            };
            
            // Remove join form
            joinForm.remove();
        }
    });
});
class Whiteboard {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentTool = 'pencil';
        this.color = '#000000';
        this.size = 2;
        this.isDrawing = false;
        this.paths = [];
        this.currentPath = [];
        this.undoStack = [];
        this.redoStack = [];

        this.initializeCanvas();
        this.setupEventListeners();
        this.setupTools();
        this.setupVoiceRecording();
    }

    initializeCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
        this.redraw();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        document.querySelector('.color-picker').addEventListener('input', (e) => {
            this.color = e.target.value;
        });

        document.querySelector('.size-slider').addEventListener('input', (e) => {
            this.size = parseInt(e.target.value);
        });

        document.getElementById('clearBtn').addEventListener('click', () => this.clearCanvas());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveCanvas());
    }

    setupTools() {
        const tools = document.querySelectorAll('.tool-btn[data-tool]');
        tools.forEach(tool => {
            tool.addEventListener('click', () => {
                tools.forEach(t => t.classList.remove('active'));
                tool.classList.add('active');
                this.currentTool = tool.dataset.tool;
            });
        });

        // Text tool setup
        document.querySelector('[data-tool="text"]').addEventListener('click', () => {
            document.getElementById('textModal').style.display = 'flex';
        });

        document.getElementById('addText').addEventListener('click', () => {
            const text = document.getElementById('textInput').value;
            if (text) {
                this.addText(text, this.lastClickX, this.lastClickY);
                document.getElementById('textModal').style.display = 'none';
                document.getElementById('textInput').value = '';
            }
        });

        document.getElementById('cancelText').addEventListener('click', () => {
            document.getElementById('textModal').style.display = 'none';
        });
    }

    setupVoiceRecording() {
        const voiceBtn = document.getElementById('voiceBtn');
        const voiceRecording = document.querySelector('.voice-recording');
        const stopRecording = document.getElementById('stopRecording');

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            voiceBtn.addEventListener('click', () => {
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => {
                        this.mediaRecorder = new MediaRecorder(stream);
                        this.chunks = [];

                        this.mediaRecorder.ondataavailable = (e) => {
                            this.chunks.push(e.data);
                        };

                        this.mediaRecorder.onstop = () => {
                            const blob = new Blob(this.chunks, { type: 'audio/ogg; codecs=opus' });
                            const audioURL = URL.createObjectURL(blob);
                            this.addVoiceNote(audioURL);
                        };

                        this.mediaRecorder.start();
                        voiceRecording.style.display = 'block';
                    })
                    .catch(err => console.error('Error accessing microphone:', err));
            });

            stopRecording.addEventListener('click', () => {
                this.mediaRecorder.stop();
                voiceRecording.style.display = 'none';
            });
        }
    }

    startDrawing(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.lastClickX = x;
        this.lastClickY = y;

        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.currentPath = [{
            x,
            y,
            tool: this.currentTool,
            color: this.color,
            size: this.size
        }];
    }

    draw(e) {
        if (!this.isDrawing) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        switch (this.currentTool) {
            case 'pencil':
                this.drawFreehand(x, y);
                break;
            case 'eraser':
                this.erase(x, y);
                break;
            case 'rectangle':
                this.drawRectangle(x, y);
                break;
            case 'circle':
                this.drawCircle(x, y);
                break;
        }

        this.currentPath.push({
            x,
            y,
            tool: this.currentTool,
            color: this.color,
            size: this.size
        });
    }

    drawFreehand(x, y) {
        this.ctx.lineTo(x, y);
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.size;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();
    }

    erase(x, y) {
        this.ctx.clearRect(x - this.size * 5, y - this.size * 5, this.size * 10, this.size * 10);
    }

    drawRectangle(x, y) {
        this.redraw();
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.size;
        const width = x - this.currentPath[0].x;
        const height = y - this.currentPath[0].y;
        this.ctx.strokeRect(this.currentPath[0].x, this.currentPath[0].y, width, height);
    }

    drawCircle(x, y) {
        this.redraw();
        this.ctx.beginPath();
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.size;
        const radius = Math.sqrt(
            Math.pow(x - this.currentPath[0].x, 2) +
            Math.pow(y - this.currentPath[0].y, 2)
        );
        this.ctx.arc(this.currentPath[0].x, this.currentPath[0].y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.paths.push(this.currentPath);
            this.undoStack.push(this.currentPath);
            this.redoStack = [];
            this.currentPath = [];
        }
    }

    addText(text, x, y) {
        this.ctx.font = `${this.size * 10}px Arial`;
        this.ctx.fillStyle = this.color;
        this.ctx.fillText(text, x, y);
        
        this.paths.push([{
            x,
            y,
            tool: 'text',
            color: this.color,
            size: this.size,
            text: text
        }]);
    }

    addVoiceNote(audioURL) {
        const audio = document.createElement('audio');
        audio.src = audioURL;
        audio.controls = true;
        
        const noteContainer = document.createElement('div');
        noteContainer.style.position = 'absolute';
        noteContainer.style.left = `${this.lastClickX}px`;
        noteContainer.style.top = `${this.lastClickY}px`;
        noteContainer.appendChild(audio);
        
        this.canvas.parentElement.appendChild(noteContainer);
        
        // Make voice note draggable
        let isDragging = false;
        let currentX;
        let currentY;
        
        noteContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            currentX = e.clientX - noteContainer.offsetLeft;
            currentY = e.clientY - noteContainer.offsetTop;
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                noteContainer.style.left = `${e.clientX - currentX}px`;
                noteContainer.style.top = `${e.clientY - currentY}px`;
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    clearCanvas() {
        const confirmation = confirm('Are you sure you want to clear the canvas?');
        if (confirmation) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.paths = [];
            this.undoStack = [];
            this.redoStack = [];
        }
    }

    saveCanvas() {
        const link = document.createElement('a');
        link.download = 'whiteboard.png';
        link.href = this.canvas.toDataURL();
        link.click();
    }

    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (const path of this.paths) {
            if (path[0].tool === 'text') {
                const textData = path[0];
                this.ctx.font = `${textData.size * 10}px Arial`;
                this.ctx.fillStyle = textData.color;
                this.ctx.fillText(textData.text, textData.x, textData.y);
                continue;
            }

            this.ctx.beginPath();
            this.ctx.moveTo(path[0].x, path[0].y);
            this.ctx.strokeStyle = path[0].color;
            this.ctx.lineWidth = path[0].size;
            this.ctx.lineCap = 'round';

            for (let i = 1; i < path.length; i++) {
                const point = path[i];
                
                if (point.tool === 'pencil') {
                    this.ctx.lineTo(point.x, point.y);
                } else if (point.tool === 'eraser') {
                    this.ctx.clearRect(point.x - point.size * 5, point.y - point.size * 5, point.size * 10, point.size * 10);
                }
            }
            
            if (path[0].tool === 'rectangle') {
                const width = path[path.length - 1].x - path[0].x;
                const height = path[path.length - 1].y - path[0].y;
                this.ctx.strokeRect(path[0].x, path[0].y, width, height);
            } else if (path[0].tool === 'circle') {
                const radius = Math.sqrt(
                    Math.pow(path[path.length - 1].x - path[0].x, 2) +
                    Math.pow(path[path.length - 1].y - path[0].y, 2)
                );
                this.ctx.arc(path[0].x, path[0].y, radius, 0, Math.PI * 2);
            }
            
            this.ctx.stroke();
        }
    }

    // Mock methods for real-time collaboration (to be implemented with WebSocket)
    broadcastDraw(data) {
        // Send drawing data to server
        console.log('Broadcasting:', data);
    }

    receiveDraw(data) {
        // Receive drawing data from server
        console.log('Received:', data);
        this.paths.push(data);
        this.redraw();
    }
}

// Chat functionality
class Chat {
    constructor() {
        this.messages = document.querySelector('.chat-messages');
        this.input = document.querySelector('.chat-input input');
        this.sendButton = document.querySelector('.chat-input button');

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }

    sendMessage() {
        const message = this.input.value.trim();
        if (message) {
            this.addMessage('You', message);
            this.input.value = '';
        }
    }

    addMessage(sender, text) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.innerHTML = `<strong>${sender}:</strong> ${text}`;
        this.messages.appendChild(messageElement);
        this.messages.scrollTop = this.messages.scrollHeight;
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const whiteboard = new Whiteboard();
    const chat = new Chat();

    // Mock collaboration
    window.mockNewParticipant = (name) => {
        const participant = document.createElement('div');
        participant.className = 'participant';
        participant.innerHTML = `
            <div class="participant-avatar"></div>
            <span>${name}</span>
        `;
        document.querySelector('.participants').appendChild(participant);
    };
});