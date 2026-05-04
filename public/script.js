// On page load, fetch available filters
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('/api/filters');
        const filters = await response.json();
        
        const container = document.getElementById('filter-container');
        container.innerHTML = ''; // clear loading text

        // Create a checkbox for every Subject/Level combo
        filters.forEach(combo => {
            const label = document.createElement('label');
            label.className = 'filter-item';
            label.innerHTML = `<input type="checkbox" value="${combo}"> ${combo}`;
            container.appendChild(label);
        });
    } catch (error) {
        document.getElementById('loading-filters').innerText = "Failed to load subjects. Please refresh.";
    }
});

// Handle Navigation
document.getElementById('logo').addEventListener('click', () => {
    document.getElementById('study-screen').style.display = 'none';
    document.getElementById('home-screen').style.display = 'block';
    
    // Hide paper elements to reset state
    document.getElementById('paper-image').style.display = 'none';
    document.getElementById('drive-link').style.display = 'none';
    document.getElementById('next-btn').style.display = 'none';
});

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('home-screen').style.display = 'none';
    document.getElementById('study-screen').style.display = 'flex';
    fetchRandomPage();
});

document.getElementById('next-btn').addEventListener('click', fetchRandomPage);

async function fetchRandomPage() {
    // Show Loading
    document.getElementById('loading-paper').style.display = 'block';
    document.getElementById('paper-image').style.display = 'none';
    document.getElementById('drive-link').style.display = 'none';
    document.getElementById('next-btn').style.display = 'none';
    document.getElementById('pdf-filename').innerText = 'Selecting a random paper...';

    // Gather selected checkboxes
    const checkboxes = document.querySelectorAll('.filter-item input:checked');
    const selectedCombos = Array.from(checkboxes).map(cb => cb.value);
    
    // Build the query URL (e.g. ?combos=H2 Mathematics,H1 Physics)
    let url = '/api/random-paper';
    if (selectedCombos.length > 0) {
        url += `?combos=${encodeURIComponent(selectedCombos.join(','))}`;
    }

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error("No papers found or server error.");
        }

        const data = await response.json();
        
        // Update UI with the new paper
        document.getElementById('pdf-filename').innerText = data.filename;
        document.getElementById('paper-image').src = data.imageBuffer;
        document.getElementById('drive-link').href = data.driveLink;

        // Reveal standard UI
        document.getElementById('loading-paper').style.display = 'none';
        document.getElementById('paper-image').style.display = 'block';
        document.getElementById('drive-link').style.display = 'flex';
        document.getElementById('next-btn').style.display = 'block';

        // Reveal Answer Key button ONLY if a match was found in the unfiltered dataset
        const answerBtn = document.getElementById('answer-link');
        if (data.answerLink) {
            answerBtn.href = data.answerLink;
            answerBtn.style.display = 'flex';
        } else {
            answerBtn.style.display = 'none';
        }

    } catch (error) {
        console.error(error);
        document.getElementById('loading-paper').innerText = 'Error loading paper. Try selecting different subjects.';
    }
}
