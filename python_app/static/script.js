document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('video-form');
    const errorMsg = document.getElementById('error-message');
    const apiKeyInput = document.getElementById('apiKey');
    const promptInput = document.getElementById('prompt');
    const settings = document.querySelector('.settings');
    let serverKey = false;

    if (localStorage.getItem('apiKey')) apiKeyInput.value = localStorage.getItem('apiKey');
    if (localStorage.getItem('userPrompt')) promptInput.value = localStorage.getItem('userPrompt');

    fetch('/config').then(r => r.json()).then(cfg => {
        serverKey = cfg.serverKey;
        if (serverKey) apiKeyInput.placeholder = "Optional: the server already has a key";
    }).catch(() => {});

    function showError(text) {
        errorMsg.textContent = text;
        errorMsg.classList.remove('hidden');
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const apiKey = apiKeyInput.value.trim();
        const url = document.getElementById('url').value.trim();

        if (!url) return showError("Paste a YouTube link first.");
        const match = url.match(/(?:v=|\/|embed\/|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&#\/]|$)/);
        if (!match) return showError("That doesn't look like a YouTube video link.");
        if (!apiKey && !serverKey) {
            settings.open = true;
            apiKeyInput.focus();
            return showError("Add your Gemini API key below to continue.");
        }

        localStorage.setItem('apiKey', apiKey);
        localStorage.setItem('userPrompt', promptInput.value.trim());
        window.location.href = `/watch?v=${match[1]}`;
    });

    // Recent videos, from chat history saved by the watch page
    const history = JSON.parse(localStorage.getItem('chatHistory') || '[]').slice(0, 6);
    if (history.length) {
        const grid = document.getElementById('recent-grid');
        history.forEach(chat => {
            const a = document.createElement('a');
            a.className = 'recent-card';
            a.href = `/watch?chat=${encodeURIComponent(chat.id)}`;
            const img = document.createElement('img');
            img.src = `https://i.ytimg.com/vi/${encodeURIComponent(chat.videoId)}/mqdefault.jpg`;
            img.alt = '';
            img.loading = 'lazy';
            const title = document.createElement('span');
            title.textContent = chat.title;
            a.append(img, title);
            grid.appendChild(a);
        });
        document.getElementById('recent').classList.remove('hidden');
    }
});
