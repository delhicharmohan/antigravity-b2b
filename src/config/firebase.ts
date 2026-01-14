import * as admin from 'firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

// Ensure the service account key path is defined or use default credentials
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

try {
    if (serviceAccountPath) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        admin.initializeApp();
        console.warn("No GOOGLE_APPLICATION_CREDENTIALS path set, using default application credentials.");
    }
} catch (error) {
    console.error("Firebase Admin Initialization Error:", error);
}

export const db = admin.firestore();
export const auth = admin.auth();
