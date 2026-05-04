// public/script.js
let currentAnswers = {};

async function fetchNewPaper() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('paper-image').style.display = 'none';
    document.getElementById('result').innerText = '';
    document.getElementById('next-btn').style.display = 'none';
    
    // Clear inputs
    document.getElementById('guess-year').value = '';
    document.getElementById('guess-school').value = '';
    document.getElementById('guess-subject').value = '';
    document.getElementById('guess-level').value = '';

    try {
        const response = await fetch('/api/random-paper');
        const data = await response.json();
        
        currentAnswers = data.answers;
        
        document.getElementById('paper-image').src = data.imageBuffer;
        document.getElementById('paper-image').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
        
    } catch (error) {
        console.error("Failed to load paper", error);
        document.getElementById('loading').innerText = 'Error loading paper.';
    }
}

document.getElementById('submit-btn').addEventListener('click', () => {
    const guessYear = document.getElementById('guess-year').value;
    const guessSchool = document.getElementById('guess-school').value.toUpperCase();
    const guessSubject = document.getElementById('guess-subject').value;
    const guessLevel = document.getElementById('guess-level').value;

    let score = 0;
    let feedback = [];

    // Compare guesses (using loose matching for subjects)
    if (guessYear == currentAnswers.year) score++;
    else feedback.push(`Year was ${currentAnswers.year}`);

    if (guessSchool == currentAnswers.school) score++;
    else feedback.push(`School was ${currentAnswers.school}`);

    if (guessLevel == currentAnswers.level) score++;
    else feedback.push(`Level was ${currentAnswers.level}`);

    // Simple includes check for subject as they can be long
    if (guessSubject && currentAnswers.subject.toLowerCase().includes(guessSubject.toLowerCase())) score++;
    else feedback.push(`Subject was ${currentAnswers.subject}`);

    const resultDiv = document.getElementById('result');
    if (score === 4) {
        resultDiv.style.color = "green";
        resultDiv.innerText = "Perfect! You got all 4 correct!";
    } else {
        resultDiv.style.color = "red";
        resultDiv.innerText = `You scored ${score}/4.\nCorrections: ${feedback.join(', ')}`;
    }

    document.getElementById('next-btn').style.display = 'block';
});

document.getElementById('next-btn').addEventListener('click', fetchNewPaper);

// Load the first paper on start
fetchNewPaper();
