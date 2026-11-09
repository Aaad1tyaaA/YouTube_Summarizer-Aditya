document.addEventListener('DOMContentLoaded', () => {
    const processBtn = document.getElementById('processBtn');
    const errorMsg = document.getElementById('error-message');

    const apiKeyInput = document.getElementById('apiKey');
    let serverKey = false;

    if(localStorage.getItem('apiKey')) {
        apiKeyInput.value = localStorage.getItem('apiKey');
    }

    fetch('/config').then(r => r.json()).then(cfg => {
        serverKey = cfg.serverKey;
        if (serverKey) apiKeyInput.placeholder = "Optional: the server already has a key";
    }).catch(() => {});

    processBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        const url = document.getElementById('url').value.trim();
        const prompt = document.getElementById('prompt').value.trim();

        if(!url || (!apiKey && !serverKey)) {
            errorMsg.textContent = serverKey ? "Please enter a YouTube URL." : "Please enter both API Key and YouTube URL.";
            errorMsg.classList.remove('hidden');
            return;
        }

        const match = url.match(/(?:v=|\/|embed\/|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&#\/]|$)/);
        if(!match) {
            errorMsg.textContent = "Invalid YouTube URL.";
            errorMsg.classList.remove('hidden');
            return;
        }

        localStorage.setItem('apiKey', apiKey);
        localStorage.setItem('userPrompt', prompt);

        window.location.href = `/watch?v=${match[1]}`;
    });
});