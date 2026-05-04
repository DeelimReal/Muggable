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
    
    // Identify Paper 1, Paper 2, etc.
    let paperCode = null;
    const match = qName.match(/p\d/); 
    if (match) paperCode = match[0];

    // Expanded keywords (added 'suggested', 'mark', 'scheme')
    const answerKeyWords = ['answer', 'ans', 'solution', 'soln', 'skema', 'rubric', 'suggested', 'mark', 'scheme'];

    const possibleAnswers = unfilteredData.filter(row => {
        const fname = String(row.filename).toLowerCase();
        
        // 1. Must not be the same file
        if (row.filename === questionFilename) return false;
        
        // 2. Must contain an "Answer" keyword
        const hasKeyword = answerKeyWords.some(w => fname.includes(w));
        if (!hasKeyword) return false;

        // 3. Try to match by folder OR by filename similarity
        // (Allows answers to be in a different folder if the filename is very similar)
        const inSameFolder = row.full_path === folderPath;
        const nameSimilarity = fname.includes(qName.split('.')[0]); 

        if (!inSameFolder && !nameSimilarity) return false;

        // 4. Match the Paper Code (P1, P2) if it exists
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

  // Inside app.get('/api/random-paper'...)
try {
    // ... code to get pdfBuffer ...

    // Fetch Folder Metadata
    const metaResponse = await drive.files.get({
        fileId: fileId,
        fields: 'parents' // This MUST be exactly 'parents'
    });

    const parents = metaResponse.data.parents;
    const folderId = (parents && parents.length > 0) ? parents[0] : null;
    const folderLink = folderId ? `https://drive.google.com/drive/folders/${folderId}` : null;

    // ... rest of the code ...
    res.json({
        imageBuffer: `data:image/jpeg;base64,${cleanBase64}`,
        filename: `Page ${randomPage} of ${randomRow.filename}`,
        driveLink: `https://drive.google.com/file/d/${fileId}/view`,
        folderLink: folderLink // Ensure this is being sent!
    });
}
