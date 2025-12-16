document.getElementById('explain-button').addEventListener('click', () => {
    const toolName = document.getElementById('tool-input').value;
    const explanationContainer = document.getElementById('explanation-container');

    if (toolName) {
        explanationContainer.innerHTML = '<p class="text-gray-400">Loading...</p>';

        fetch('/getExplanation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tool: toolName })
        })
        .then(response => response.json())
        .then(data => {
            explanationContainer.innerHTML = `<h2 class="text-xl font-bold text-primary mb-2">${toolName}</h2><p>${data.explanation}</p>`;
        })
        .catch(error => {
            console.error('Error:', error);
            explanationContainer.innerHTML = '<p class="text-red-500">Sorry, something went wrong. Please try again later.</p>';
        });
    }
});