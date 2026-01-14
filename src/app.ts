import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Configure properly for production
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Initialize Services
import { initSocket } from './services/socketService';
import { SchedulerService } from './services/schedulerService';
initSocket(io);
SchedulerService.init();

// Routes
import v1Routes from './routes/v1';
import adminRoutes from './routes/admin';

app.use('/admin', adminRoutes);
app.use('/v1', v1Routes);

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve Static Files
const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

// Fallback for SPA
app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/v1/') || req.path.startsWith('/admin/')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});


const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export { httpServer, io };
