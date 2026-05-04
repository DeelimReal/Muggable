require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const { google } = require('googleapis');
const { fromBuffer } = require('pdf2pic');

const app = express();
app.use(cors());
app.use(express.static('public'));

// Load CSV Data
let papersData = [];
fs.createReadStream('./data/papersdata_filtered.csv')
  .pipe(csv())
  .on('data', (data) => papersData.push(data))
  .on('end', () => console.log('CSV data loaded.'));

// Setup Google Drive Auth
let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
privateKey = privateKey.replace(/"/g, '').replace(/\\n/g, '\n');

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  privateKey,
  ['https://www.googleapis.com/auth/drive.readonly']
);
const drive = google.drive({ version: 'v3', auth });

// NEW ENDPOINT: Get unique combinations of Level + Subject for the Home Menu
app.get('/api/filters', (req, res) => {
    const combos = [...new Set(papersData.map(p => `${p.level} ${p.subject}`))].sort();
    // Filter out rows with missing data
    const cleanCombos = combos.filter(c => !c.includes('undefined'));
    res.json(cleanCombos);
});

// UPDATED ENDPOINT: Get a random paper based on selected filters
app.get('/api/random-paper', async (req, res) => {
  if (papersData.length === 0) return res.status(500).send('Data not loaded');

  // Read the filters sent by the user (e.g. "H2 Mathematics,H1 Physics")
  const selectedCombos = req.query.combos ? req.query.combos.split(',') : [];

  // Filter the dataset
  let filteredData = papersData;
  if (selectedCombos.length > 0) {
      filteredData = papersData.filter(row => {
          const combo = `${row.level} ${row.subject}`;
          return selectedCombos.includes(combo);
      });
  }

  // Handle case where filters match nothing
  if (filteredData.length === 0) {
      return res.status(404).json({ error: "No papers found for these subjects." });
  }

  // Pick a random paper from the filtered list
  const randomRow = filteredData[Math.floor(Math.random() * filteredData.length)];
  const fileId = randomRow.file_id;

  try {
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const pdfBuffer = Buffer.from(response.data);

    // Convert Image (Density slightly lowered for cloud stability)
    const options = {
      density: 120,
      saveFilename: "temp",
      savePath: "/tmp", 
      format: "jpg",
      width: 1000 // High width for full readability
    };
    
    const convert = fromBuffer(pdfBuffer, options);
    const pageImage = await convert(1, { responseType: "base64" });
    const cleanBase64 = pageImage.base64.replace(/(\r\n|\n|\r)/gm, "");

    res.json({
      imageBuffer: `data:image/jpeg;base64,${cleanBase64}`,
      filename: randomRow.filename,
      driveLink: `https://drive.google.com/file/d/${fileId}/view`
    });

  } catch (error) {
    console.error("Error processing paper:", error.message || error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
