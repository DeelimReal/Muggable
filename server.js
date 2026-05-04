require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const { google } = require('googleapis');
const { fromBuffer } = require('pdf2pic');
const { PDFDocument } = require('pdf-lib'); // NEW: For getting page counts

const app = express();
app.use(cors());
app.use(express.static('public'));

let papersData = [];
let unfilteredData = [];

// 1. Load the Filtered CSV and convert 'Unknown' to 'H2'
fs.createReadStream('./data/papersdata_filtered_3.csv')
  .pipe(csv())
  .on('data', (data) => {
      if (data.level === 'Unknown') data.level = 'H2';
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

app.get('/api/filters', (req, res) => {
    const combos = [...new Set(papersData.map(p => `${p.level} ${p.subject}`))].sort();
    const cleanCombos = combos.filter(c => !c.includes('undefined'));
    res.json(cleanCombos);
});

// SMART MATCHER: Finds the answer key for a given paper
function findAnswerKeyId(questionFilename, folderPath) {
    const qName = String(questionFilename).toLowerCase();
    
    // Try to identify if this is Paper 1, Paper 2, etc. (e.g., "p1", "p2")
    let paperCode = null;
    const match = qName.match(/p\d/); 
    if (match) paperCode = match[0];

    const answerKeyWords = ['answer', 'ans', 'solution', 'soln', 'skema', 'rubric'];

    const possibleAnswers = unfilteredData.filter(row => {
        if (row.full_path !== folderPath) return false; // Must be in the same folder
        
        const fname = String(row.filename).toLowerCase();
        const hasKeyword = answerKeyWords.some(w => fname.includes(w));
        const isNotSameFile = row.filename !== questionFilename;
        
        if (!hasKeyword || !isNotSameFile) return false;
        
        // If the question is "P1", make sure the answer key also has "P1" in its name
        if (paperCode && !fname.includes(paperCode)) return false;
        
        return true;
    });

    return possibleAnswers.length > 0 ? possibleAnswers[0].file_id : null;
}

app.get('/api/random-paper', async (req, res) => {
  if (papersData.length === 0) return res.status(500).send('Data not loaded yet');

  const selectedCombos = req.query.combos ? req.query.combos.split(',') : [];

  let filteredData = papersData;
  if (selectedCombos.length > 0) {
      filteredData = papersData.filter(row => {
          const combo = `${row.level} ${row.subject}`;
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

    // --- NEW: Determine Random Page (> 1) ---
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();
    
    // Pick a random page from 2 to pageCount. If it's a 1-page document, fallback to page 1.
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

    // --- NEW: Find matching Answer Key ---
    const answerKeyId = findAnswerKeyId(randomRow.filename, randomRow.full_path);
    const answerLink = answerKeyId ? `https://drive.google.com/file/d/${answerKeyId}/view` : null;

    res.json({
      imageBuffer: `data:image/jpeg;base64,${cleanBase64}`,
      filename: `Page ${randomPage} of ${randomRow.filename}`, // Let the user know which page they got
      driveLink: `https://drive.google.com/file/d/${fileId}/view`,
      answerLink: answerLink // Send the answer link if found
    });

  } catch (error) {
    console.error("Error processing paper:", error.message || error);
    res.status(500).json({ error: 'Failed to process document' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
