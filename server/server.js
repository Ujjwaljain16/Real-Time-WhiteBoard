const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Express server setup
const app = express();
app.use(express.static(path.join(__dirname, '../public')));

// Start HTTP server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
});

// WebSocket server setup
const wss = new WebSocket.Server({ server });

// Store active rooms and their participants
const rooms = new Map();

wss.on('connection', (ws) => {
    let userId = uuidv4();
    let roomId = null;

    console.log(`New client connected: ${userId}`);

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch(data.type) {
            case 'join':
                roomId = data.roomId;
                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Map());
                }
                rooms.get(roomId).set(userId, ws);
                
                // Notify others in room about new participant
                broadcastToRoom(roomId, {
                    type: 'participant_joined',
                    userId: userId,
                    name: data.name
                }, userId);

                // Send current participant list to new user
                const participants = Array.from(rooms.get(roomId).keys())
                    .filter(id => id !== userId);
                ws.send(JSON.stringify({
                    type: 'current_participants',
                    participants: participants
                }));
                break;

            case 'draw':
                broadcastToRoom(roomId, {
                    type: 'draw',
                    userId: userId,
                    drawData: data.drawData
                }, userId);
                break;

            case 'chat':
                broadcastToRoom(roomId, {
                    type: 'chat',
                    userId: userId,
                    name: data.name,
                    message: data.message
                }, userId);
                break;
        }
    });

    ws.on('close', () => {
        if (roomId && rooms.has(roomId)) {
            rooms.get(roomId).delete(userId);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            } else {
                broadcastToRoom(roomId, {
                    type: 'participant_left',
                    userId: userId
                }, userId);
            }
        }
        console.log(`Client disconnected: ${userId}`);
    });

    function broadcastToRoom(roomId, data, excludeUserId) {
        if (rooms.has(roomId)) {
            rooms.get(roomId).forEach((client, id) => {
                if (id !== excludeUserId && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(data));
                }
            });
        }
    }
});