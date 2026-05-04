// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const { google } = require('googleapis');
const { fromBuffer } = require('pdf2-pic');

const app = express();
app.use(cors());
app.use(express.static('public')); // Serve the frontend

// Load CSV Data into memory
let papersData = [];
fs.createReadStream('./data/papersdata_filtered.csv')
  .pipe(csv())
  .on('data', (data) => papersData.push(data))
  .on('end', () => console.log('CSV data loaded.'));

// Setup Google Drive Auth
const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/drive.readonly']
);
const drive = google.drive({ version: 'v3', auth });

app.get('/api/random-paper', async (req, res) => {
  if (papersData.length === 0) return res.status(500).send('Data not loaded');

  // 1. Pick a random paper
  const randomRow = papersData[Math.floor(Math.random() * papersData.length)];
  const fileId = randomRow.file_id;

  try {
    // 2. Download the PDF from Google Drive as an ArrayBuffer
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const pdfBuffer = Buffer.from(response.data);

    // 3. Convert the first page of the PDF to an Image
    const options = {
      density: 150, // Image resolution
      format: "jpg",
      width: 800
    };
    const convert = fromBuffer(pdfBuffer, options);
    
    // Convert page 1 to base64
    const pageImage = await convert(1, { responseType: "base64" });

    // 4. Send the image and the correct answers back to the frontend
    res.json({
      imageBuffer: `data:image/jpeg;base64,${pageImage.base64}`,
      answers: {
        year: randomRow.year,
        school: randomRow.school,
        subject: randomRow.subject,
        level: randomRow.level
      }
    });

  } catch (error) {
    console.error("Error processing paper:", error);
    res.status(500).send('Error fetching or processing document');
  }
});

app.listen(3000, () => console.log('Server running on port 3000'));
