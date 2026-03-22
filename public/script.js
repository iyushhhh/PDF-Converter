let uploadedFiles = []; // stores {filename, originalname, ...}
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const filesContainer = document.getElementById('filesContainer');
const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resultSection = document.getElementById('resultSection');
const errorMsg = document.getElementById('errorMsg');
const fileListDiv = document.getElementById('fileList');
let currentPdfFilename = null;

// Tailwind script already loaded

// Drag & Drop
dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('border-blue-500', 'bg-zinc-900');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('border-blue-500', 'bg-zinc-900');
});
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('border-blue-500', 'bg-zinc-900');
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => handleFiles(fileInput.files));

function handleFiles(files) {
  errorMsg.classList.add('hidden');
  const formData = new FormData();
  Array.from(files).forEach(file => formData.append('files', file));

  // Upload with progress
  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/upload');

  xhr.upload.onprogress = e => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      // Could add progress bar here if desired
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      uploadedFiles = data.files;
      renderFileList();
      fileListDiv.classList.remove('hidden');
      convertBtn.disabled = false;
    } else {
      showError(JSON.parse(xhr.responseText).error);
    }
  };

  xhr.onerror = () => showError('Upload failed');
  xhr.send(formData);
}

function renderFileList() {
  filesContainer.innerHTML = '';
  uploadedFiles.forEach((file, index) => {
    const isImage = file.originalname.toLowerCase().match(/\.(jpg|jpeg|png)$/);

    const card = document.createElement('div');
    card.className = `file-card bg-zinc-900 rounded-2xl p-4 flex flex-col items-center text-center`;

    if (isImage) {
      card.innerHTML = `
        <img src="/uploads/${file.filename}" class="w-full h-32 object-contain rounded-xl mb-3">
        <p class="text-sm font-medium truncate w-full">${file.originalname}</p>
      `;
    } else {
      card.innerHTML = `
        <div class="w-16 h-16 bg-zinc-800 rounded-xl flex items-center justify-center text-4xl mb-3">📝</div>
        <p class="text-sm font-medium truncate w-full">${file.originalname}</p>
      `;
    }
    filesContainer.appendChild(card);
  });
}

// Convert
convertBtn.addEventListener('click', async () => {
  if (uploadedFiles.length === 0) return;

  convertBtn.disabled = true;
  document.getElementById('convertText').classList.add('hidden');
  document.getElementById('spinner').classList.remove('hidden');

  try {
    const res = await fetch('/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: uploadedFiles })
    });

    const data = await res.json();
    if (data.success) {
      currentPdfFilename = data.pdfFilename;
      resultSection.classList.remove('hidden');
      convertBtn.classList.add('hidden');
    } else {
      showError(data.error);
    }
  } catch (e) {
    showError('Conversion failed');
  } finally {
    convertBtn.disabled = false;
    document.getElementById('convertText').classList.remove('hidden');
    document.getElementById('spinner').classList.add('hidden');
  }
});

// Download
downloadBtn.addEventListener('click', () => {
  if (!currentPdfFilename) return;
  window.location.href = `/download/${currentPdfFilename}`;
  // Reset after download
  setTimeout(() => {
    resetApp();
  }, 3000);
});

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.remove('hidden');
}

function resetApp() {
  uploadedFiles = [];
  filesContainer.innerHTML = '';
  fileListDiv.classList.add('hidden');
  resultSection.classList.add('hidden');
  convertBtn.classList.remove('hidden');
  convertBtn.disabled = true;
  currentPdfFilename = null;
}

// Clear all
document.getElementById('clearAll').addEventListener('click', resetApp);

// Keyboard shortcut (Ctrl/Cmd + K to upload)
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    fileInput.click();
  }
});