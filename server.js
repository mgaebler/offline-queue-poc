import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Enable CORS
app.use(cors());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Store submissions in memory (for POC)
const submissions = [];

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Submit endpoint - accepts FormData with images
app.post('/api/submit', upload.any(), (req, res) => {
    try {
        console.log('📥 Received submission');
        console.log('Body:', req.body);
        console.log('Files:', req.files?.length || 0);

        const submission = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            data: req.body,
            files: req.files?.map(file => ({
                fieldname: file.fieldname,
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size
            })) || [],
            receivedAt: new Date().toISOString()
        };

        submissions.push(submission);

        console.log(`✅ Submission stored (Total: ${submissions.length})`);

        res.json({
            success: true,
            message: 'Submission received successfully',
            id: submission.id
        });

    } catch (error) {
        console.error('❌ Error processing submission:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get all submissions (for debugging)
app.get('/api/submissions', (req, res) => {
    res.json({
        total: submissions.length,
        submissions: submissions
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Mock API Server running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
    console.log(`   Submit:       POST http://localhost:${PORT}/api/submit`);
    console.log(`   View all:     GET  http://localhost:${PORT}/api/submissions`);
});
