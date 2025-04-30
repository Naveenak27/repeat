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
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Store active email jobs
const activeJobs = new Map();

// Alternative implementation using setTimeout instead of setInterval
function scheduleNextEmail(recipient, mailOptions) {
  console.log(`Scheduling next email to ${recipient} in 3 minutes...`);
  
  // Using setTimeout for more precise control
  const timeoutId = setTimeout(async () => {
    try {
      const startTime = Date.now();
      await transporter.sendMail(mailOptions);
      const endTime = Date.now();
      
      console.log(`Email sent to ${recipient} at ${new Date().toISOString()}`);
      console.log(`Email sending took ${endTime - startTime}ms`);
      
      // Schedule the next one only after this one completes
      if (activeJobs.has(recipient)) {
        scheduleNextEmail(recipient, mailOptions);
      }
    } catch (error) {
      console.error('Error sending scheduled email:', error);
      // Try again in case of error
      if (activeJobs.has(recipient)) {
        scheduleNextEmail(recipient, mailOptions);
      }
    }
  }, 3 * 60 * 1000); // Hard-coded 3 minutes (180,000 ms)
  
  // Update the job with the new timeout ID
  const jobInfo = activeJobs.get(recipient);
  if (jobInfo) {
    // Clear any existing timeout
    if (jobInfo.timeoutId) clearTimeout(jobInfo.timeoutId);
    
    // Update with new timeout
    activeJobs.set(recipient, {
      ...jobInfo,
      timeoutId,
      nextScheduledAt: new Date(Date.now() + 3 * 60 * 1000)
    });
  }
}

// Start email sending using setTimeout chain
app.post('/api/start-email', async (req, res) => {
  try {
    const { recipient, subject, content } = req.body;
    
    // Validate inputs
    if (!recipient || !subject || !content) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    // Stop any existing job for this recipient
    if (activeJobs.has(recipient)) {
      const existingJob = activeJobs.get(recipient);
      if (existingJob.timeoutId) clearTimeout(existingJob.timeoutId);
    }
    
    // Define email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: recipient,
      subject,
      html: content
    };
    
    console.log(`Starting new email schedule for ${recipient} - every 3 minutes`);
    
    // Send first email immediately
    await transporter.sendMail(mailOptions);
    console.log(`Initial email sent to ${recipient} at ${new Date().toISOString()}`);
    
    // Store job info
    activeJobs.set(recipient, {
      subject,
      startedAt: new Date(),
      intervalMinutes: 3,
      lastSentAt: new Date()
    });
    
    // Schedule the next email
    scheduleNextEmail(recipient, mailOptions);
    
    res.status(200).json({
      success: true,
      message: `Email schedule started. Sending every 3 minutes to ${recipient}`
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
    const job = activeJobs.get(recipient);
    if (job.timeoutId) clearTimeout(job.timeoutId);
    activeJobs.delete(recipient);
    res.status(200).json({ success: true, message: `Email schedule to ${recipient} stopped` });
  } else {
    res.status(404).json({ success: false, message: 'No active email schedule found for this recipient' });
  }
});

// Get status of all active jobs
app.get('/api/active-jobs', (req, res) => {
  const jobs = Array.from(activeJobs.entries()).map(([email, details]) => ({
    email,
    intervalMinutes: details.intervalMinutes || 3,
    subject: details.subject,
    startedAt: details.startedAt,
    lastSentAt: details.lastSentAt,
    nextScheduledAt: details.nextScheduledAt
  }));
  
  res.status(200).json({
    success: true,
    activeJobs: jobs,
    count: jobs.length
  });
});

// Status endpoint for uptime robot
app.get('/api/status', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeJobs: activeJobs.size
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Email interval set to 3 minutes (180000 ms)`);
});
