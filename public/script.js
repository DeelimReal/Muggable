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
    // Show Loading[cite: 2]
    document.getElementById('loading-paper').style.display = 'block';[cite: 2]
    document.getElementById('paper-image').style.display = 'none';[cite: 2]
    document.getElementById('drive-link').style.display = 'none';[cite: 2]
    document.getElementById('next-btn').style.display = 'none';[cite: 2]
    document.getElementById('pdf-filename').innerText = 'Selecting a random paper...';[cite: 2]

    // Gather selected checkboxes[cite: 2]
    const checkboxes = document.querySelectorAll('.filter-item input:checked');[cite: 2]
    const selectedCombos = Array.from(checkboxes).map(cb => cb.value);[cite: 2]
    
    // Build the query URL (e.g. ?combos=H2 Mathematics,H1 Physics)[cite: 2]
    let url = '/api/random-paper';[cite: 2]
    if (selectedCombos.length > 0) {[cite: 2]
        url += `?combos=${encodeURIComponent(selectedCombos.join(','))}`;[cite: 2]
    }

    try {
        const response = await fetch(url);[cite: 2]
        
        if (!response.ok) {
            throw new Error("No papers found or server error.");[cite: 2]
        }

        const data = await response.json();[cite: 2]
        
        // Update UI with the new paper[cite: 2]
        document.getElementById('pdf-filename').innerText = data.filename;[cite: 2]
        document.getElementById('paper-image').src = data.imageBuffer;[cite: 2]
        document.getElementById('drive-link').href = data.driveLink;[cite: 2]

        // Reveal standard UI elements[cite: 2]
        document.getElementById('loading-paper').style.display = 'none';[cite: 2]
        document.getElementById('paper-image').style.display = 'block';[cite: 2]
        document.getElementById('drive-link').style.display = 'flex';[cite: 2]
        document.getElementById('next-btn').style.display = 'block';[cite: 2]

        // Handle the Full Folder Button
        const folderBtn = document.getElementById('folder-link');
        if (data.folderLink) {
            folderBtn.href = data.folderLink;
            folderBtn.style.display = 'flex';
        } else {
            folderBtn.style.display = 'none';
        }

    } catch (error) {
        console.error(error);[cite: 2]
        document.getElementById('loading-paper').innerText = 'Error loading paper. Try selecting different subjects.';[cite: 2]
    }
}
