import dotenv from 'dotenv';

// Load environment variables if not already loaded
dotenv.config();

const requiredEnvVars = ['ADMIN_SECRET'];

// Check for missing environment variables
const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

export const ADMIN_SECRET = process.env.ADMIN_SECRET!;
