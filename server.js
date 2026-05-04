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

// 1. Load the Filtered CSV and convert 'Unknown' to 'H2'
fs.createReadStream('./data/papersdata_filtered_3.csv')
  .pipe(csv())
  .on('data', (data) => {
      // Handle capitalized CSV columns
      if (data.level === 'Unknown') data.level = 'H2';
      if (data.Level === 'Unknown') data.Level = 'H2';
      papersData.push(data);
  })
  .on('end', () => console.log('Filtered CSV data loaded.'));

// 2. Load the Unfiltered CSV (for finding answer keys)
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

// ENDPOINT: Get filters (Handles uppercase and lowercase)
app.get('/api/filters', (req, res) => {
    const combos = [...new Set(papersData.map(p => {
        const level = p.level || p.Level || p.LEVEL;
        const subject = p.subject || p.Subject || p.SUBJECT;
        return `${level} ${subject}`;
    }))].sort();
    
    // Filter out rows with missing data
    const cleanCombos = combos.filter(c => !c.includes('undefined'));
    res.json(cleanCombos);
});

// SMART MATCHER: Finds the answer key for a given paper
function findAnswerKeyId(questionFilename, folderPath) {
    const qName = String(questionFilename).toLowerCase();
    
    let paperCode = null;
    const match = qName.match(/p\d/); 
    if (match) paperCode = match[0];

    const answerKeyWords = ['answer', 'ans', 'solution', 'soln', 'skema', 'rubric'];

    const possibleAnswers = unfilteredData.filter(row => {
        if (row.full_path !== folderPath) return false; 
        
        const fname = String(row.filename).toLowerCase();
        const hasKeyword = answerKeyWords.some(w => fname.includes(w));
        const isNotSameFile = row.filename !== questionFilename;
        
        if (!hasKeyword || !isNotSameFile) return false;
        
        if (paperCode && !fname.includes(paperCode)) return false;
        
        return true;
    });

    return possibleAnswers.length > 0 ? possibleAnswers[0].file_id : null;
}

// ENDPOINT: Get a random paper
app.get('/api/random-paper', async (req, res) => {
  if (papersData.length === 0) return res.status(500).send('Data not loaded yet');

  const selectedCombos = req.query.combos ? req.query.combos.split(',') : [];

  let filteredData = papersData;
  if (selectedCombos.length > 0) {
      filteredData = papersData.filter(row => {
          // Check for capitalization
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
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const pdfBuffer = Buffer.from(response.data);

    // Determine Random Page (> 1)
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    
    let randomPage = 1;
    if (pageCount > 1) {
        randomPage = Math.floor(Math.random() * (pageCount - 1)) + 2; 
    }

    // Convert Image
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

    // Find matching Answer Key
    const answerKeyId = findAnswerKeyId(randomRow.filename, randomRow.full_path);
    const answerLink = answerKeyId ? `https://drive.google.com/file/d/${answerKeyId}/view` : null;

    res.json({
      imageBuffer: `data:image/jpeg;base64,${cleanBase64}`,
      filename: `Page ${randomPage} of ${randomRow.filename}`, 
      driveLink: `https://drive.google.com/file/d/${fileId}/view`,
      answerLink: answerLink 
    });

  } catch (error) {
    console.error("Error processing paper:", error.message || error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
