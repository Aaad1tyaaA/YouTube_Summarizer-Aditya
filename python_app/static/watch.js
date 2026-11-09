document.addEventListener("DOMContentLoaded", () => {
    const youtubePlayer = document.getElementById("youtubePlayer");
    const chatHistory = document.getElementById("chat-history");
    const chatInput = document.getElementById("chat-input");
    const sendChatBtn = document.getElementById("send-chat-btn");
    const transcriptLoader = document.getElementById("transcript-loader");
    const chatError = document.getElementById("chat-error");
    const historyList = document.getElementById("history-list");
    const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
    const downloadPdfBtn = document.getElementById("download-pdf-btn");
    const mainContainer = document.getElementById("main-container");

    let currentTranscript = "";
    let currentChatId = null;
    let chatHistoryStorage = [];

    function init() {
        loadHistoryFromStorage();
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');
        const chatId = urlParams.get('chat');

        if (chatId) {
            loadChat(chatId);
        } else if (videoId) {
            startNewChat(videoId);
        } else {
            transcriptLoader.textContent = "Error: No Video ID or Chat ID found.";
            chatInput.disabled = true;
            sendChatBtn.disabled = true;
        }

        sendChatBtn.addEventListener("click", sendChatMessage);
        chatInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault(); sendChatMessage();
            }
        });
        sidebarToggleBtn.addEventListener("click", toggleSidebar);
        document.getElementById("scrim").addEventListener("click", toggleSidebar);
        downloadPdfBtn.addEventListener("click", downloadChatAsPDF);
        chatInput.addEventListener("input", autoGrow);
        document.querySelectorAll("#suggestions button").forEach(btn => btn.addEventListener("click", () => {
            chatInput.value = btn.textContent;
            sendChatMessage();
        }));
        // Composer state follows the input's disabled flag, wherever the code toggles it
        new MutationObserver(() => {
            suggestions.classList.toggle("hidden", chatInput.disabled || chatHistory.querySelector(".you") !== null);
        }).observe(chatInput, { attributes: true, attributeFilter: ["disabled"] });
    }

    const suggestions = document.getElementById("suggestions");

    function autoGrow() {
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
    }

    function showVideoInfo(videoId) {
        fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + videoId)}`)
            .then(r => r.ok ? r.json() : null)
            .then(info => {
                if (!info) return;
                document.getElementById("video-title").textContent = info.title;
                document.getElementById("video-channel").textContent = info.author_name;
                document.title = `${info.title} · YouTube TLDR`;
                // Name the chat after the video instead of "New Chat"
                const chat = chatHistoryStorage.find(c => c.id === currentChatId);
                if (chat && (chat.title === "New Chat" || chat.title.endsWith("..."))) {
                    chat.title = info.title;
                    localStorage.setItem("chatHistory", JSON.stringify(chatHistoryStorage));
                    loadHistoryFromStorage();
                    document.getElementById(`history-link-${currentChatId}`)?.classList.add("active");
                }
            }).catch(() => {});
    }

    function loadHistoryFromStorage() {
        chatHistoryStorage = JSON.parse(localStorage.getItem("chatHistory")) || [];
        historyList.innerHTML = "";
        
        chatHistoryStorage.forEach(chat => {
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.href = `/watch?chat=${chat.id}`;
            a.textContent = chat.title;
            a.id = `history-link-${chat.id}`;
            li.appendChild(a);

            const renameBtn = document.createElement("button");
            renameBtn.textContent = '✎';
            renameBtn.classList.add("rename-btn");
            renameBtn.title = "Rename Chat";
            renameBtn.addEventListener("click", (e) => {
                e.preventDefault(); 
                renameChat(chat.id);
            });
            li.appendChild(renameBtn);
            historyList.appendChild(li);
        });
    }

    function saveChatToStorage() {
        const chatIndex = chatHistoryStorage.findIndex(chat => chat.id === currentChatId);
        if (chatIndex === -1) return;

        const messages = [];
        chatHistory.querySelectorAll(".chat-message:not(.system)").forEach(msgEl => {  // status lines would pile up on every reload
            messages.push({
                sender: msgEl.dataset.sender,
                text: msgEl.dataset.text 
            });
        });
        
        chatHistoryStorage[chatIndex].messages = messages;
        
        if (chatHistoryStorage[chatIndex].title === "New Chat") {
             const firstSummary = messages.find(m => m.sender === "Summary");
             if (firstSummary) {
                const firstLine = firstSummary.text.split('\n')[0].replace(/[*#]/g, '').trim();
                chatHistoryStorage[chatIndex].title = firstLine.substring(0, 30) + "...";
             }
        }
        
        localStorage.setItem("chatHistory", JSON.stringify(chatHistoryStorage));
        loadHistoryFromStorage(); 
        document.getElementById(`history-link-${currentChatId}`)?.classList.add("active");
    }

    function renameChat(chatId) {
        const chatIndex = chatHistoryStorage.findIndex(c => c.id === chatId);
        if (chatIndex === -1) return;
        const oldTitle = chatHistoryStorage[chatIndex].title;
        const newTitle = prompt("Enter new chat name:", oldTitle === "New Chat" ? "" : oldTitle);
        if (newTitle && newTitle.trim() !== "") {
            chatHistoryStorage[chatIndex].title = newTitle.trim();
            localStorage.setItem("chatHistory", JSON.stringify(chatHistoryStorage));
            loadHistoryFromStorage(); 
            if (chatId === currentChatId) {
                 document.getElementById(`history-link-${currentChatId}`)?.classList.add("active");
            }
        }
    }

    function loadChat(chatId) {
        currentChatId = chatId;
        const chat = chatHistoryStorage.find(c => c.id === chatId);
        if (!chat) { transcriptLoader.textContent = "Error: Chat not found."; return; }

        document.getElementById(`history-link-${chatId}`)?.classList.add("active");
        youtubePlayer.src = `https://www.youtube.com/embed/${chat.videoId}`;
        showVideoInfo(chat.videoId);

        chatHistory.innerHTML = "";
        chat.messages.forEach(msg => {
            addMessage(msg.sender, msg.text);
        });
        fetchTranscript(chat.videoId, false); 
    }

    async function startNewChat(videoId) {
        currentChatId = `chat_${new Date().getTime()}`;
        const newChat = { id: currentChatId, videoId: videoId, title: "New Chat", messages: [] };
        
        chatHistoryStorage.unshift(newChat);
        localStorage.setItem("chatHistory", JSON.stringify(chatHistoryStorage));
        window.history.replaceState(null, '', `/watch?chat=${currentChatId}`);
        loadHistoryFromStorage();
        document.getElementById(`history-link-${currentChatId}`)?.classList.add("active");
        
        youtubePlayer.src = `https://www.youtube.com/embed/${videoId}`;
        showVideoInfo(videoId);
        fetchTranscript(videoId, true);
    }

    // Temporary animated status line; caller removes it when the step finishes
    function status(text) {
        addMessage("System", text);
        const el = chatHistory.lastChild;
        el.classList.add("thinking");
        return el;
    }

    function showError(text) {
        addMessage("System", text);
        chatHistory.lastChild.classList.add("error");
    }

    async function fetchTranscript(vId, getSummary = false) {
        transcriptLoader.classList.add("hidden");
        const step = status("Reading the transcript");
        const apiKey = localStorage.getItem("apiKey") || "";
        const videoUrl = `https://www.youtube.com/watch?v=${vId}`;

        try {
            const response = await fetch("/get_transcript", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: videoUrl })
            });
            const data = await response.json();
            step.remove();

            if (response.ok) {
                currentTranscript = data.transcript;
                if (getSummary) {
                    fetchInitialSummary(apiKey);
                } else {
                    chatInput.disabled = false;
                    sendChatBtn.disabled = false;
                }
            } else {
                showError(data.detail);
            }
        } catch (err) {
            step.remove();
            showError(`Couldn't reach the server: ${err.message}`);
        }
    }

    async function fetchInitialSummary(apiKey) {
        const userPrompt = localStorage.getItem("userPrompt") || "Summarize this video concisely.";
        const step = status("Writing your summary");

        try {
            const response = await fetch("/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey, transcript: currentTranscript, prompt: userPrompt })
            });
            const data = await response.json();
            step.remove();

            if (response.ok) {
                addMessage("Summary", data.summary);
            } else {
                showError(data.detail);
            }
        } catch (err) {
            step.remove();
            showError(`Couldn't reach the server: ${err.message}`);
        } finally {
            chatInput.disabled = false;
            sendChatBtn.disabled = false;
            saveChatToStorage();
        }
    }

    async function sendChatMessage() {
        const question = chatInput.value.trim();
        const apiKey = localStorage.getItem("apiKey") || "";

        if (!question || !currentTranscript) return;

        addMessage("You", question);
        chatInput.value = "";
        autoGrow();
        suggestions.classList.add("hidden");
        sendChatBtn.disabled = true;
        chatError.classList.add("hidden");
        const step = status("Thinking");

        try {
            const response = await fetch("/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey, question, transcript: currentTranscript })
            });
            const data = await response.json();
            step.remove();

            if (response.ok) {
                addMessage("Gemini", data.answer);
            } else {
                showError(data.detail);
            }
        } catch (err) {
            step.remove();
            showError(`Couldn't reach the server: ${err.message}`);
        } finally {
            sendChatBtn.disabled = false;
            chatInput.focus();
            saveChatToStorage();
        }
    }

    function toggleSidebar() {
        // Wide screens: collapse in place. Narrow screens: slide-over drawer.
        const narrow = window.matchMedia("(max-width: 1100px)").matches;
        mainContainer.classList.toggle(narrow ? "sidebar-open" : "sidebar-collapsed");
    }

    function downloadChatAsPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const chat = chatHistoryStorage.find(c => c.id === currentChatId);
        if (!chat) return;

        doc.setFontSize(16);
        doc.text(chat.title, 10, 20); 
        doc.setFontSize(10);
        
        let yPos = 30; 
        const contentWidth = 180; 

        chat.messages.forEach(msg => {
            if (yPos > 270) { 
                doc.addPage();
                yPos = 20;
            }
            doc.setFont(undefined, 'bold');
            doc.text(`${msg.sender}:`, 10, yPos);
            yPos += 7; 
            doc.setFont(undefined, 'normal');
            const lines = doc.splitTextToSize(msg.text, contentWidth);
            doc.text(lines, 10, yPos);
            yPos += (lines.length * 6) + 7; 
        });

        doc.save(`${chat.title.replace(/[^a-z0-9]/gi, '_')}.pdf`); 
    }

    function addMessage(sender, text) {
        const messageDiv = document.createElement("div");
        messageDiv.classList.add("chat-message", sender.toLowerCase().replace(/\s+/g, '-'));
        messageDiv.dataset.sender = sender;
        messageDiv.dataset.text = text;

        const label = document.createElement("strong");
        label.className = "msg-label";
        label.textContent = sender === "Gemini" ? "Answer" : sender;
        const content = document.createElement("div");
        content.className = "message-content";
        if (sender === "Gemini" || sender === "Summary") {
            content.innerHTML = DOMPurify.sanitize(marked.parse(text));  // AI output can echo anything from the transcript
        } else {
            content.textContent = text;
            content.style.whiteSpace = "pre-wrap";
        }
        messageDiv.append(label, content);
        chatHistory.appendChild(messageDiv);
        // Long AI answers: show their start, not their end
        if (sender === "Summary" || sender === "Gemini") {
            chatHistory.scrollTop = messageDiv.offsetTop - chatHistory.offsetTop - 12;
        } else {
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
    }

    init();
});