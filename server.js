// server.js
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // Or any other email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Store active email jobs
const activeJobs = new Map();

// Start email sending at intervals
app.post('/api/start-email', async (req, res) => {
  try {
    const { recipient, subject, content, intervalMinutes = 1 } = req.body;
    
    // Validate inputs
    if (!recipient || !subject || !content) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    // Stop any existing job for this recipient
    if (activeJobs.has(recipient)) {
      clearInterval(activeJobs.get(recipient));
    }
    
    // Define email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipient,
      subject,
      html: content
    };
    
    // Send first email immediately
    await transporter.sendMail(mailOptions);
    
    // Set up interval (convert minutes to milliseconds)
    const intervalId = setInterval(async () => {
      try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${recipient} at ${new Date().toISOString()}`);
      } catch (error) {
        console.error('Error sending scheduled email:', error);
      }
    }, intervalMinutes * 60 * 1000);
    
    // Store the interval ID
    activeJobs.set(recipient, intervalId);
    
    res.status(200).json({ 
      success: true, 
      message: `Email schedule started. Sending every ${intervalMinutes} minute(s) to ${recipient}` 
    });
  } catch (error) {
    console.error('Error starting email schedule:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Stop email sending
app.post('/api/stop-email', (req, res) => {
  const { recipient } = req.body;
  
  if (!recipient) {
    return res.status(400).json({ success: false, message: 'Recipient email is required' });
  }
  
  if (activeJobs.has(recipient)) {
    clearInterval(activeJobs.get(recipient));
    activeJobs.delete(recipient);
    res.status(200).json({ success: true, message: `Email schedule to ${recipient} stopped` });
  } else {
    res.status(404).json({ success: false, message: 'No active email schedule found for this recipient' });
  }
});

// Get status of all active jobs
app.get('/api/active-jobs', (req, res) => {
  const jobs = Array.from(activeJobs.keys());
  res.status(200).json({ 
    success: true, 
    activeJobs: jobs, 
    count: jobs.length 
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});