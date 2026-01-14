import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export const socket = io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
});

socket.on('connect', () => {
    console.log('Connected to WebSocket server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from WebSocket server');
});

export const subscribeToMarket = (marketId: string) => {
    socket.emit('subscribe', marketId);
};

export const unsubscribeFromMarket = (marketId: string) => {
    socket.emit('unsubscribe', marketId);
};
