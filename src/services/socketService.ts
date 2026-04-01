import { Server } from 'socket.io';

let io: Server;

export const initSocket = (socketIo: Server) => {
    io = socketIo;

    io.on('connection', (socket) => {
        console.log(`Merchant Client connected: ${socket.id}`);

        // Allow clients to subscribe to specific markets
        socket.on('subscribe', (marketId: string) => {
            socket.join(`market_${marketId}`);
            console.log(`Socket ${socket.id} joined market_${marketId}`);
        });

        socket.on('unsubscribe', (marketId: string) => {
            socket.leave(`market_${marketId}`);
        });

        // ===== IPL Room Subscriptions =====
        socket.on('join_ipl_match', (data: { matchKey: string }) => {
            socket.join(`ipl:match:${data.matchKey}`);
            socket.join(`ipl:match:${data.matchKey}:contests`);
            socket.join(`ipl:match:${data.matchKey}:micro`);
            console.log(`Socket ${socket.id} joined IPL match ${data.matchKey}`);
        });

        socket.on('leave_ipl_match', (data: { matchKey: string }) => {
            socket.leave(`ipl:match:${data.matchKey}`);
            socket.leave(`ipl:match:${data.matchKey}:contests`);
            socket.leave(`ipl:match:${data.matchKey}:micro`);
        });

        socket.on('join_ipl_lobby', () => {
            socket.join('ipl:matches');
            console.log(`Socket ${socket.id} joined IPL lobby`);
        });

        socket.on('disconnect', () => {
            console.log(`Merchant Client disconnected: ${socket.id}`);
        });
    });
};

export const getIo = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

// Function to push odds updates
export const emitOddsUpdate = (marketId: string, oddsData: any) => {
    if (io) {
        io.to(`market:${marketId}`).emit('odds_update', oddsData);
    }
};

export const emitMarketStatusUpdate = (marketId: string, status: string) => {
    if (io) {
        io.to(`market:${marketId}`).emit('market_status_update', { marketId, status });
        // Also emit to a global admin room if needed
        io.emit('global_status_update', { marketId, status });
    }
};

export const emitMarketDeleted = (marketId: string) => {
    if (io) {
        io.to(`market:${marketId}`).emit('market_deleted', { marketId });
        io.emit('global_market_deleted', { marketId });
    }
};

export const emitMicroContestOpen = (matchKey: string, payload: any) => {
    if (io) {
        io.to(`ipl:match:${matchKey}:micro`).emit('micro_contest_open', payload);
    }
};

export const emitMicroContestSettled = (matchKey: string, payload: any) => {
    if (io) {
        io.to(`ipl:match:${matchKey}:micro`).emit('micro_contest_settled', payload);
    }
};
