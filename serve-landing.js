#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const LANDING_PAGE = path.join(__dirname, 'landing-page.html');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/landing-page.html') {
    fs.readFile(LANDING_PAGE, 'utf8', (err, content) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading landing page');
        return;
      }
      
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`
🚀 StripedShield Landing Page Server
====================================
✅ Server running at: http://localhost:${PORT}
✅ EC2 Public URL: http://44.207.87.228:${PORT}
✅ S3 Bucket: stripedshield-landing-1755195863

Press Ctrl+C to stop the server
  `);
});