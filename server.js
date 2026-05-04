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

// UPDATED ENDPOINT: Get a random paper
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
