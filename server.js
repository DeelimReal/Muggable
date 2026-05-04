require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const { google } = require('googleapis');
const { fromBuffer } = require('pdf2pic');
const { PDFDocument } = require('pdf-lib');

const app = express();
app.use(cors());
app.use(express.static('public'));

let papersData = [];
let unfilteredData = [];

// 1. Load the Filtered CSV (Updated to version 6)
fs.createReadStream('./data/papersdata_filtered_3.csv')
  .pipe(csv())
  .on('data', (data) => {
      if (data.level === 'Unknown') data.level = 'H2';
      if (data.Level === 'Unknown') data.Level = 'H2';
      papersData.push(data);
  })
  .on('end', () => console.log('Filtered CSV data loaded.'));

// 2. Load the Unfiltered CSV
fs.createReadStream('./data/papersdata_unfiltered_2.csv')
  .pipe(csv())
  .on('data', (data) => unfilteredData.push(data))
  .on('end', () => console.log('Unfiltered CSV data loaded.'));

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

app.get('/api/filters', (req, res) => {
    const combos = [...new Set(papersData.map(p => {
        const level = p.level || p.Level || p.LEVEL;
        const subject = p.subject || p.Subject || p.SUBJECT;
        return `${level} ${subject}`;
    }))].sort();
    const cleanCombos = combos.filter(c => !c.includes('undefined'));
    res.json(cleanCombos);
});

app.get('/api/random-paper', async (req, res) => {
  if (papersData.length === 0) return res.status(500).send('Data not loaded yet');

  const selectedCombos = req.query.combos ? req.query.combos.split(',') : [];

  let filteredData = papersData;
  if (selectedCombos.length > 0) {
      filteredData = papersData.filter(row => {
          const level = row.level || row.Level || row.LEVEL;
          const subject = row.subject || row.Subject || row.SUBJECT;
          const combo = `${level} ${subject}`;
          return selectedCombos.includes(combo);
      });
  }

  if (filteredData.length === 0) {
      return res.status(404).json({ error: "No papers found for these subjects." });
  }

  const randomRow = filteredData[Math.floor(Math.random() * filteredData.length)];
  const fileId = randomRow.file_id;

  try {
    // 1. Fetch File Content
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const pdfBuffer = Buffer.from(response.data);

    // 2. Fetch Parent Folder ID
    const metaResponse = await drive.files.get({
    fileId: fileId,
    fields: 'parents',
    supportsAllDrives: true, // CRITICAL: Required for Shared Drives
    includeItemsFromAllDrives: true // CRITICAL: Helps find files in team folders
    });
    
    const parents = metaResponse.data.parents;
    console.log("Found parents for file:", parents); // Add this line to your terminal logs to debug!
    
    const folderId = (parents && parents.length > 0) ? parents[0] : null;
    const folderLink = folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;
    const parents = metaResponse.data.parents;
    const folderId = (parents && parents.length > 0) ? parents[0] : null;
    const folderLink = folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;

    // 3. Determine Random Page
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    let randomPage = 1;
    if (pageCount > 1) {
        randomPage = Math.floor(Math.random() * (pageCount - 1)) + 2; 
    }

    // 4. Convert Image
    const options = {
      density: 120,
      saveFilename: "temp",
      savePath: "/tmp", 
      format: "jpg",
      width: 1000 
    };
    
    const convert = fromBuffer(pdfBuffer, options);
    const pageImage = await convert(randomPage, { responseType: "base64" });
    const cleanBase64 = pageImage.base64.replace(/(\r\n|\n|\r)/gm, "");

    res.json({
      imageBuffer: `data:image/jpeg;base64,${cleanBase64}`,
      filename: `Page ${randomPage} of ${randomRow.filename}`,
      driveLink: `https://drive.google.com/file/d/${fileId}/view`,
      folderLink: folderLink 
    });

  } catch (error) {
    console.error("Error processing paper:", error.message || error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
